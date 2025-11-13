import { createCarFromFile } from 'filecoin-pin/core/unixfs'
import { checkUploadReadiness, executeUpload } from 'filecoin-pin/core/upload'
import pino from 'pino'
import { useCallback, useEffect, useRef, useState } from 'react'
import { storeDataSetId, storeDataSetIdForProvider } from '../lib/local-storage/data-set.ts'
import type { StepState } from '../types/upload/step.ts'
import { getDebugParams } from '../utils/debug-params.ts'
import { formatFileSize } from '../utils/format-file-size.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'
import { cacheIpniResult } from './use-ipni-check.ts'

interface UploadState {
  isUploading: boolean
  stepStates: StepState[]
  error?: string
  currentCid?: string
  pieceCid?: string
  transactionHash?: string
}

export const INITIAL_STEP_STATES: StepState[] = [
  { step: 'creating-car', progress: 0, status: 'pending' },
  { step: 'checking-readiness', progress: 0, status: 'pending' },
  { step: 'uploading-car', progress: 0, status: 'pending' },
  /**
   * NOT GRANULAR.. only pending, in progress, completed
   *
   * This moves from pending to in-progress once the upload is completed.
   * We then would want to verify that the CID is retrievable via IPNI before
   * moving to completed.
   */
  { step: 'announcing-cids', progress: 0, status: 'pending' },
  /**
   * NOT GRANULAR.. only pending, in progress, completed
   * This moves from pending to in-progress once the upload is completed.
   * We then would want to verify that the transaction is on chain before moving to completed.
   * in-progress->completed is confirmed by the onPieceConfirmed callback to `executeUpload`
   */
  { step: 'finalizing-transaction', progress: 0, status: 'pending' },
]

export const INPI_ERROR_MESSAGE =
  "CID not yet indexed by IPNI. It's stored on Filecoin and fetchable now, but may take time to appear on IPFS."

/**
 * Handles the end-to-end upload workflow with filecoin-pin:
 * - Builds a CAR file in-browser
 * - Checks upload readiness (allowances, balances)
 * - Executes the upload with progress callbacks
 * - Tracks IPNI availability and on-chain confirmation
 *
 * UI components receive a single `uploadState` object plus `uploadFile`/`resetUpload`
 * actions so they stay dumb and declarative.
 */
export const useFilecoinUpload = () => {
  const { synapse, storageContext, providerInfo, checkIfDatasetExists, wallet } = useFilecoinPinContext()

  // Use refs to track the latest context values, so the upload callback can access them
  // even if the dataset is initialized after the callback is created
  const storageContextRef = useRef(storageContext)
  const providerInfoRef = useRef(providerInfo)

  useEffect(() => {
    storageContextRef.current = storageContext
    providerInfoRef.current = providerInfo
  }, [storageContext, providerInfo])

  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    stepStates: INITIAL_STEP_STATES,
  })

  const updateStepState = useCallback((step: StepState['step'], updates: Partial<StepState>) => {
    setUploadState((prev) => ({
      ...prev,
      stepStates: prev.stepStates.map((stepState) =>
        stepState.step === step ? { ...stepState, ...updates } : stepState
      ),
    }))
  }, [])

  const uploadFile = useCallback(
    async (file: File, metadata?: Record<string, string>): Promise<string> => {
      setUploadState({
        isUploading: true,
        stepStates: INITIAL_STEP_STATES,
      })

      try {
        // Step 1: Create CAR and upload to Filecoin SP
        updateStepState('creating-car', { status: 'in-progress', progress: 0 })

        // Create CAR from file with progress tracking
        const carResult = await createCarFromFile(file, {
          onProgress: (bytesProcessed: number, totalBytes: number) => {
            const progressPercent = Math.round((bytesProcessed / totalBytes) * 100)
            updateStepState('creating-car', { progress: progressPercent })
          },
        })

        // Store the CID for IPNI checking
        const rootCid = carResult.rootCid.toString()
        setUploadState((prev) => ({
          ...prev,
          currentCid: rootCid,
        }))

        updateStepState('creating-car', { status: 'completed', progress: 100 })
        // creating the car is done, but its not uploaded yet.

        // Step 2: Check readiness
        updateStepState('checking-readiness', { status: 'in-progress', progress: 0 })

        if (!synapse) {
          throw new Error('Synapse client not initialized. Please check your configuration.')
        }
        updateStepState('checking-readiness', { progress: 50 })

        // validate that we can actually upload the car, passing the autoConfigureAllowances flag to true to automatically configure allowances if needed.
        const readinessCheck = await checkUploadReadiness({
          synapse,
          fileSize: carResult.carBytes.length,
          autoConfigureAllowances: true,
        })

        if (readinessCheck.status === 'blocked') {
          // TODO: show the user the reasons why the upload is blocked, prompt them to fix based on the suggestions.
          throw new Error('Readiness check failed')
        }

        updateStepState('checking-readiness', { status: 'completed', progress: 100 })

        // Create a simple logger for the upload
        const logger = pino({
          level: 'debug',
          browser: {
            asObject: true,
          },
        })

        // Get the latest storage context and provider info from refs
        const currentStorageContext = storageContextRef.current
        const currentProviderInfo = providerInfoRef.current

        if (!currentStorageContext || !currentProviderInfo) {
          throw new Error('Storage context not ready. Failed to initialize storage context. Please try again.')
        }

        // Capture the initial dataset ID (before upload) to detect if it's created during upload
        const initialDataSetId = currentStorageContext.dataSetId

        console.debug('[FilecoinUpload] Using storage context from provider:', {
          providerInfo: currentProviderInfo,
          dataSetId: initialDataSetId,
        })

        const synapseService = {
          storage: currentStorageContext,
          providerInfo: currentProviderInfo,
          synapse,
        }

        // Step 3: Upload CAR to Synapse (Filecoin SP)
        updateStepState('uploading-car', { status: 'in-progress', progress: 0 })

        await executeUpload(synapseService, carResult.carBytes, carResult.rootCid, {
          logger,
          contextId: `upload-${Date.now()}`,
          metadata: {
            ...(metadata ?? {}),
            label: file.name,
            fileSize: formatFileSize(file.size),
          },
          onProgress: (event) => {
            switch (event.type) {
              case 'onUploadComplete':
                console.debug('[FilecoinUpload] Upload complete, piece CID:', event.data.pieceCid)
                // Store the piece CID from the callback
                setUploadState((prev) => ({
                  ...prev,
                  pieceCid: event.data.pieceCid.toString(),
                }))
                updateStepState('uploading-car', { status: 'completed', progress: 100 })
                // now the other steps can move to in-progress
                updateStepState('announcing-cids', { status: 'in-progress', progress: 0 })
                break

              case 'onPieceAdded': {
                const txHash = event.data.txHash
                console.debug('[FilecoinUpload] Piece add transaction:', { txHash })
                // Store the transaction hash if available
                if (txHash) {
                  setUploadState((prev) => ({
                    ...prev,
                    transactionHash: txHash,
                  }))
                }
                // now the finalizing-transaction step can move to in-progress
                updateStepState('finalizing-transaction', { status: 'in-progress', progress: 0 })
                break
              }

              case 'onPieceConfirmed': {
                // Save the dataset ID if it was just created during this upload
                const currentDataSetId = storageContextRef.current?.dataSetId
                if (wallet?.status === 'ready' && currentDataSetId !== undefined && initialDataSetId === undefined) {
                  const debugParams = getDebugParams()

                  // Only use storeDataSetIdForProvider if user explicitly provided providerId in URL
                  if (debugParams.providerId !== null) {
                    storeDataSetIdForProvider(wallet.data.address, currentProviderInfo.id, currentDataSetId)
                  } else {
                    storeDataSetId(wallet.data.address, currentDataSetId)
                  }
                }

                // Complete finalization
                updateStepState('finalizing-transaction', { status: 'completed', progress: 100 })
                console.debug('[FilecoinUpload] Upload fully completed and confirmed on chain')
                break
              }
              case 'ipniProviderResults.failed': {
                // IPNI check failed - mark as error with a helpful message
                console.warn('[FilecoinUpload] IPNI check failed after max attempts:', event.data.error.message)
                // Cache the failed result
                cacheIpniResult(rootCid, 'failed')
                updateStepState('announcing-cids', {
                  status: 'error',
                  progress: 0,
                  error: INPI_ERROR_MESSAGE,
                })
                break
              }
              case 'ipniProviderResults.complete': {
                console.debug('[FilecoinUpload] IPNI check succeeded, marking announcing-cids as completed')
                // Cache the success result
                cacheIpniResult(rootCid, 'success')
                updateStepState('announcing-cids', { status: 'completed', progress: 100 })
                break
              }
              default:
                break
            }
          },
        })

        // Return the actual CID from the CAR result
        return rootCid
      } catch (error) {
        console.error('[FilecoinUpload] Upload failed with error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Upload failed'
        setUploadState((prev) => ({
          ...prev,
          error: errorMessage,
        }))
        throw error
      } finally {
        setUploadState((prev) => ({
          ...prev,
          isUploading: false,
        }))
      }
    },
    [updateStepState, synapse, checkIfDatasetExists]
  )

  const resetUpload = useCallback(() => {
    setUploadState({
      isUploading: false,
      stepStates: INITIAL_STEP_STATES,
      currentCid: undefined,
      pieceCid: undefined,
      transactionHash: undefined,
    })
  }, [])

  return {
    uploadState,
    uploadFile,
    resetUpload,
  }
}
