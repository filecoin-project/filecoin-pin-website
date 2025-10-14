import { createCarFromFile } from 'filecoin-pin/core/unixfs'
import { checkUploadReadiness, executeUpload } from 'filecoin-pin/core/upload'
import pino from 'pino'
import { useCallback, useContext, useMemo, useState } from 'react'
import { FilecoinPinContext } from '../context/filecoin-pin-provider.tsx'
import type { Progress } from '../types/upload-progress.ts'
import { formatFileSize } from '../utils/format-file-size.ts'
import { useIpniCheck } from './use-ipni-check.ts'

interface UploadState {
  isUploading: boolean
  progress: Progress[]
  error?: string
  currentCid?: string
  pieceCid?: string
  transactionHash?: string
}

const initialProgress: Progress[] = [
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

export const useFilecoinUpload = () => {
  const context = useContext(FilecoinPinContext)
  if (!context) {
    throw new Error('useFilecoinUpload must be used within FilecoinPinProvider')
  }
  const { synapse, storageContext, providerInfo, wallet } = context

  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: initialProgress,
  })

  const updateProgress = useCallback((step: Progress['step'], updates: Partial<Progress>) => {
    setUploadState((prev) => ({
      ...prev,
      progress: prev.progress.map((p) => (p.step === step ? { ...p, ...updates } : p)),
    }))
  }, [])

  // Check if announcing-cids is in progress
  const isAnnouncingCids = useMemo(() => {
    const announcingStep = uploadState.progress.find((p) => p.step === 'announcing-cids')
    return announcingStep?.status === 'in-progress'
  }, [uploadState.progress])

  // Debug logging for IPNI check
  console.debug('[FilecoinUpload] IPNI check state:', {
    currentCid: uploadState.currentCid,
    isAnnouncingCids,
    announcingStep: uploadState.progress.find((p) => p.step === 'announcing-cids'),
  })

  // Use IPNI check hook to poll for CID availability
  useIpniCheck({
    cid: uploadState.currentCid ?? null,
    isActive: isAnnouncingCids,
    maxAttempts: 10,
    onSuccess: () => {
      console.debug('[FilecoinUpload] IPNI check succeeded, marking announcing-cids as completed')
      updateProgress('announcing-cids', { status: 'completed', progress: 100 })
    },
    onError: (error) => {
      // IPNI check failed - mark as error with a helpful message
      console.warn('[FilecoinUpload] IPNI check failed after max attempts:', error.message)
      updateProgress('announcing-cids', {
        status: 'error',
        progress: 0,
        error: 'CID not yet indexed by IPNI. The file is stored but may take time to be discoverable on the network.',
      })
    },
  })

  const uploadFile = useCallback(
    async (file: File, metadata?: Record<string, string>): Promise<string> => {
      setUploadState({
        isUploading: true,
        progress: initialProgress,
      })

      try {
        // Step 1: Create CAR and upload to Filecoin SP
        updateProgress('creating-car', { status: 'in-progress', progress: 0 })

        // Create CAR from file with progress tracking
        const carResult = await createCarFromFile(file, {
          onProgress: (bytesProcessed: number, totalBytes: number) => {
            const progressPercent = Math.round((bytesProcessed / totalBytes) * 100)
            updateProgress('creating-car', { progress: progressPercent })
          },
        })

        // Store the CID for IPNI checking
        setUploadState((prev) => ({
          ...prev,
          currentCid: carResult.rootCid.toString(),
        }))

        updateProgress('creating-car', { status: 'completed', progress: 100 })
        // creating the car is done, but its not uploaded yet.

        // Step 2: Check readiness
        updateProgress('checking-readiness', { status: 'in-progress', progress: 0 })

        if (!synapse) {
          throw new Error('Synapse client not initialized. Please check your configuration.')
        }
        updateProgress('checking-readiness', { progress: 50 })

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

        updateProgress('checking-readiness', { status: 'completed', progress: 100 })

        // Create a simple logger for the upload
        const logger = pino({
          level: 'debug',
          browser: {
            asObject: true,
          },
        })

        // Ensure we have storage context from provider (created during data set initialization)
        if (!storageContext || !providerInfo) {
          // This should never happen because the upload button is disabled if the data set is not ready
          throw new Error('Storage context not ready. Please ensure a data set is initialized before uploading.')
        }

        console.debug('[FilecoinUpload] Using storage context from provider:', {
          providerInfo,
          dataSetId: storageContext.dataSetId,
        })

        const synapseService = {
          storage: storageContext,
          providerInfo,
          synapse,
        }

        // Step 3: Upload CAR to Synapse (Filecoin SP)
        updateProgress('uploading-car', { status: 'in-progress', progress: 0 })

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
              updateProgress('uploading-car', { status: 'completed', progress: 100 })
              // now the other steps can move to in-progress
              updateProgress('announcing-cids', { status: 'in-progress', progress: 0 })
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
              updateProgress('finalizing-transaction', { status: 'in-progress', progress: 0 })
            },
            onPieceConfirmed: () => {
              // Complete finalization
              updateProgress('finalizing-transaction', { status: 'completed', progress: 100 })
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
    [updateProgress, synapse, storageContext, providerInfo, wallet, uploadState.pieceCid, uploadState.transactionHash]
  )

  const resetUpload = useCallback(() => {
    setUploadState({
      isUploading: false,
      progress: initialProgress,
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
