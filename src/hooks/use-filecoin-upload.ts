import { createCarFromFile } from 'filecoin-pin/core/unixfs'
import { checkUploadReadiness, executeUpload, type UploadExecutionResult } from 'filecoin-pin/core/upload'
import pino from 'pino'
import { useCallback, useState } from 'react'
import { storeDataSetId } from '../lib/local-storage/data-set.ts'
import type { StepState } from '../types/upload/step.ts'
import { formatFileSize } from '../utils/format-file-size.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'
import { cacheIpniResult } from './use-ipni-check.ts'
import { useWaitableRef } from './use-waitable-ref.ts'

interface UploadState {
  isUploading: boolean
  stepStates: StepState[]
  error?: string
  currentCid?: string
  pieceCid?: string
  transactionHash?: string
  transactionHashes: string[]
  confirmedCopies: number
  expectedCopies: number
  copies?: UploadExecutionResult['copies']
  failures?: UploadExecutionResult['failures']
  network?: string
}

const logger = pino({
  level: 'debug',
  browser: {
    asObject: true,
  },
})

export const INITIAL_STEP_STATES: StepState[] = [
  { step: 'creating-car', progress: 0, status: 'pending' },
  { step: 'checking-readiness', progress: 0, status: 'pending' },
  { step: 'uploading-car', progress: 0, status: 'pending' },
  { step: 'replicating', progress: 0, status: 'pending' },
  { step: 'announcing-cids', progress: 0, status: 'pending' },
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
 */
export const useFilecoinUpload = () => {
  const { synapse, wallet, setDataSetId } = useFilecoinPinContext()

  // Waitable ref so the upload callback can access synapse even if initialized after callback creation
  const synapseRef = useWaitableRef(synapse)

  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    stepStates: INITIAL_STEP_STATES,
    transactionHashes: [],
    confirmedCopies: 0,
    expectedCopies: 0,
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
        transactionHashes: [],
        confirmedCopies: 0,
        expectedCopies: 0,
      })

      try {
        updateStepState('creating-car', { status: 'in-progress', progress: 0 })
        logger.info('Creating CAR from file')

        const carResult = await createCarFromFile(file, {
          onProgress: (bytesProcessed: number, totalBytes: number) => {
            const progressPercent = Math.round((bytesProcessed / totalBytes) * 100)
            updateStepState('creating-car', { progress: progressPercent })
          },
        })

        const rootCid = carResult.rootCid.toString()
        setUploadState((prev) => ({
          ...prev,
          currentCid: rootCid,
        }))

        updateStepState('creating-car', { status: 'completed', progress: 100 })
        logger.info({ carResult }, 'CAR created')

        updateStepState('checking-readiness', { status: 'in-progress', progress: 0 })
        updateStepState('uploading-car', { status: 'in-progress', progress: 0 })
        logger.info('Waiting for synapse to be initialized')
        const synapse = await synapseRef.wait()
        logger.info('Synapse initialized')
        updateStepState('checking-readiness', { progress: 50 })

        logger.info('Checking upload readiness')
        const readinessCheck = await checkUploadReadiness({
          synapse,
          fileSize: carResult.carBytes.length,
          autoConfigureAllowances: true,
        })

        logger.info({ readinessCheck }, 'Upload readiness check')

        if (readinessCheck.status === 'blocked') {
          throw new Error('Readiness check failed')
        }

        updateStepState('checking-readiness', { status: 'completed', progress: 100 })
        logger.info('Upload readiness check completed')

        logger.info('Uploading CAR to Synapse')
        const result = await executeUpload(synapse, carResult.carBytes, carResult.rootCid, {
          logger,
          contextId: `upload-${Date.now()}`,
          pieceMetadata: {
            ...(metadata ?? {}),
            label: file.name,
            fileSize: formatFileSize(file.size),
          },
          onProgress: (event) => {
            switch (event.type) {
              case 'onStored':
                console.debug('[FilecoinUpload] Stored on provider:', String(event.data.providerId))
                setUploadState((prev) => ({
                  ...prev,
                  pieceCid: event.data.pieceCid.toString(),
                }))
                updateStepState('uploading-car', { status: 'completed', progress: 100 })
                updateStepState('replicating', { status: 'in-progress', progress: 0 })
                break

              case 'onCopyComplete':
                console.debug('[FilecoinUpload] Secondary copy complete on provider:', String(event.data.providerId))
                updateStepState('replicating', { status: 'completed', progress: 100 })
                updateStepState('announcing-cids', { status: 'in-progress', progress: 0 })
                break

              case 'onCopyFailed':
                console.debug('[FilecoinUpload] Secondary copy failed on provider:', String(event.data.providerId))
                updateStepState('replicating', {
                  status: 'error',
                  progress: 0,
                  error: 'Secondary copy failed, file stored with reduced redundancy',
                })
                updateStepState('announcing-cids', { status: 'in-progress', progress: 0 })
                break

              case 'onPiecesAdded': {
                const txHash = event.data.txHash
                console.debug('[FilecoinUpload] Piece add transaction:', { txHash })
                setUploadState((prev) => {
                  const newHashes = txHash ? [...prev.transactionHashes, txHash] : prev.transactionHashes
                  const newExpected = prev.expectedCopies + 1
                  // Fallback: complete replicating if still in-progress
                  const stepStates = prev.stepStates.map((s) =>
                    s.step === 'replicating' && s.status === 'in-progress'
                      ? { ...s, status: 'completed' as const, progress: 100 }
                      : s
                  )
                  return {
                    ...prev,
                    transactionHash: txHash || prev.transactionHash,
                    transactionHashes: newHashes,
                    expectedCopies: newExpected,
                    stepStates,
                  }
                })
                updateStepState('finalizing-transaction', { status: 'in-progress', progress: 0 })
                break
              }

              case 'onPiecesConfirmed': {
                const confirmedDataSetId = event.data.dataSetId
                if (wallet?.status === 'ready' && confirmedDataSetId != null) {
                  storeDataSetId(wallet.data.address, Number(confirmedDataSetId))
                  setDataSetId(confirmedDataSetId)
                }
                setUploadState((prev) => {
                  const newConfirmed = prev.confirmedCopies + 1
                  const allConfirmed = newConfirmed >= prev.expectedCopies && prev.expectedCopies > 0
                  return {
                    ...prev,
                    confirmedCopies: newConfirmed,
                    stepStates: prev.stepStates.map((s) =>
                      s.step === 'finalizing-transaction'
                        ? {
                            ...s,
                            status: allConfirmed ? ('completed' as const) : ('in-progress' as const),
                            progress: Math.round((newConfirmed / Math.max(prev.expectedCopies, 1)) * 100),
                          }
                        : s
                    ),
                  }
                })
                console.debug('[FilecoinUpload] Upload confirmed on chain, dataSetId:', String(confirmedDataSetId))
                break
              }

              case 'ipniProviderResults.failed': {
                console.warn('[FilecoinUpload] IPNI check failed:', event.data.error.message)
                cacheIpniResult(rootCid, 'failed')
                updateStepState('announcing-cids', {
                  status: 'error',
                  progress: 0,
                  error: INPI_ERROR_MESSAGE,
                })
                break
              }

              case 'ipniProviderResults.complete': {
                console.debug('[FilecoinUpload] IPNI check succeeded')
                cacheIpniResult(rootCid, 'success')
                updateStepState('announcing-cids', { status: 'completed', progress: 100 })
                break
              }

              default:
                break
            }
          },
        })
        logger.info('Upload completed')

        setUploadState((prev) => ({
          ...prev,
          copies: result.copies,
          failures: result.failures,
          network: result.network,
        }))

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
    [updateStepState, synapse, wallet, setDataSetId]
  )

  const resetUpload = useCallback(() => {
    setUploadState({
      isUploading: false,
      stepStates: INITIAL_STEP_STATES,
      transactionHashes: [],
      confirmedCopies: 0,
      expectedCopies: 0,
      currentCid: undefined,
      pieceCid: undefined,
      transactionHash: undefined,
      copies: undefined,
      failures: undefined,
      network: undefined,
    })
  }, [])

  return {
    uploadState,
    uploadFile,
    resetUpload,
  }
}
