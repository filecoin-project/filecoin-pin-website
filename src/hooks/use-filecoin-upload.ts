import { createStorageContext } from 'filecoin-pin/core/synapse'
import { createCarFromFile } from 'filecoin-pin/core/unixfs'
import { checkUploadReadiness, executeUpload } from 'filecoin-pin/core/upload'
import pino from 'pino'
import { useCallback, useContext, useMemo, useState } from 'react'
import type { UploadProgress } from '../components/upload/upload-progress.tsx'
import { FilecoinPinContext } from '../context/filecoin-pin-provider.tsx'
import { useIpniCheck } from './use-ipni-check.ts'

interface UploadState {
  isUploading: boolean
  progress: UploadProgress[]
  error?: string
  currentCid?: string
}

const initialProgress: UploadProgress[] = [
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
  const { synapse } = context

  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: initialProgress,
  })

  const updateProgress = useCallback((step: UploadProgress['step'], updates: Partial<UploadProgress>) => {
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

  // Use IPNI check hook to poll for CID availability
  useIpniCheck({
    cid: uploadState.currentCid ?? null,
    isActive: isAnnouncingCids,
    maxAttempts: 5,
    onSuccess: () => {
      updateProgress('announcing-cids', { status: 'completed', progress: 100 })
    },
    onError: () => {
      // If IPNI check fails after max attempts, still mark as completed
      // The CID might still be announced, just not visible yet
      updateProgress('announcing-cids', { status: 'completed', progress: 100 })
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

        // setup storage context and the SynapseService object:
        const storageContext = await createStorageContext(synapse, logger)
        console.debug('[FilecoinUpload] Storage context created:', {
          providerInfo: storageContext.providerInfo,
        })
        const synapseService = {
          ...storageContext,
          synapse,
        }

        // Step 3: Upload CAR to Synapse (Filecoin SP)
        updateProgress('uploading-car', { status: 'in-progress', progress: 0 })

        await executeUpload(synapseService, carResult.carBytes, carResult.rootCid, {
          logger,
          contextId: `upload-${Date.now()}`,
          // @ts-expect-error: metadata is not in filecoin-pin yet, see https://github.com/filecoin-project/filecoin-pin/pull/89
          metadata: {
            ...(metadata ?? {}),
            label: file.name,
          },
          callbacks: {
            onUploadComplete: () => {
              updateProgress('uploading-car', { status: 'completed', progress: 100 })
              // now the other steps can move to in-progress
              updateProgress('announcing-cids', { status: 'in-progress', progress: 0 })
            },
            onPieceAdded: (transaction) => {
              console.debug('[FilecoinUpload] Piece add transaction:', { transaction })
              // now the finalizing-transaction step can move to in-progress
              updateProgress('finalizing-transaction', { status: 'in-progress', progress: 0 })
            },
            onPieceConfirmed: () => {
              // Complete finalization
              updateProgress('finalizing-transaction', { status: 'completed', progress: 100 })
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
    [updateProgress, synapse]
  )

  const resetUpload = useCallback(() => {
    setUploadState({
      isUploading: false,
      progress: initialProgress,
      currentCid: undefined,
    })
  }, [])

  return {
    uploadState,
    uploadFile,
    resetUpload,
  }
}
