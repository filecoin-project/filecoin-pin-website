import { createCarFromFile } from 'filecoin-pin/core/unixfs'
import { checkUploadReadiness, executeUpload } from 'filecoin-pin/core/upload'
import pino from 'pino'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StepState } from '../types/upload/step.ts'
import { formatFileSize } from '../utils/format-file-size.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'
import { useIpniCheck } from './use-ipni-check.ts'

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
  const { synapse, storageContext, providerInfo, ensureDataSet } = useFilecoinPinContext()

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

  // Check if announcing-cids is in progress
  const isAnnouncingCids = useMemo(() => {
    const announcingStep = uploadState.stepStates.find((stepState) => stepState.step === 'announcing-cids')
    return announcingStep?.status === 'in-progress'
  }, [uploadState.stepStates])

  // Use IPNI check hook to poll for CID availability
  useIpniCheck({
    cid: uploadState.currentCid ?? null,
    isActive: isAnnouncingCids,
    maxAttempts: 10,
    onSuccess: () => {
      console.debug('[FilecoinUpload] IPNI check succeeded, marking announcing-cids as completed')
      updateStepState('announcing-cids', { status: 'completed', progress: 100 })
    },
    onError: (error) => {
      // IPNI check failed - mark as error with a helpful message
      console.warn('[FilecoinUpload] IPNI check failed after max attempts:', error.message)
      updateStepState('announcing-cids', {
        status: 'error',
        progress: 0,
        error: INPI_ERROR_MESSAGE,
      })
    },
  })

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
        setUploadState((prev) => ({
          ...prev,
          currentCid: carResult.rootCid.toString(),
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

        // Ensure we have a data set ready before uploading
        console.debug('[FilecoinUpload] Ensuring data set is ready before upload...')
        await ensureDataSet()

        // Get the latest storage context and provider info from refs
        // (these may have been updated by ensureDataSet if dataset wasn't ready)
        const currentStorageContext = storageContextRef.current
        const currentProviderInfo = providerInfoRef.current

        if (!currentStorageContext || !currentProviderInfo) {
          throw new Error('Storage context not ready. Failed to initialize data set. Please try again.')
        }

        console.debug('[FilecoinUpload] Using storage context from provider:', {
          providerInfo: currentProviderInfo,
          dataSetId: currentStorageContext.dataSetId,
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
          callbacks: {
            onUploadComplete: (pieceCid) => {
              console.debug('[FilecoinUpload] Upload complete, piece CID:', pieceCid)
              // Store the piece CID from the callback
              setUploadState((prev) => ({
                ...prev,
                pieceCid: pieceCid.toString(),
              }))
              updateStepState('uploading-car', { status: 'completed', progress: 100 })
              // now the other steps can move to in-progress
              updateStepState('announcing-cids', { status: 'in-progress', progress: 0 })
            },
            onPieceAdded: (transaction) => {
              console.debug('[FilecoinUpload] Piece add transaction:', { transaction })
              // Store the transaction hash if available
              if (transaction?.hash) {
                setUploadState((prev) => ({
                  ...prev,
                  transactionHash: transaction.hash,
                }))
              }
              // now the finalizing-transaction step can move to in-progress
              updateStepState('finalizing-transaction', { status: 'in-progress', progress: 0 })
            },
            onPieceConfirmed: () => {
              // Complete finalization
              updateStepState('finalizing-transaction', { status: 'completed', progress: 100 })
              console.debug('[FilecoinUpload] Upload fully completed and confirmed on chain')
            },
          },
        })

        // Return the actual CID from the CAR result
        return carResult.rootCid.toString()
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
    [updateStepState, synapse, ensureDataSet]
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
