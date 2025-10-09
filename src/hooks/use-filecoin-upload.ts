// import { validatePaymentCapacity } from 'filecoin-pin/core/payments'
import { createStorageContext } from 'filecoin-pin/core/synapse'
import { createCarFromFile } from 'filecoin-pin/core/unixfs'
import { checkUploadReadiness, executeUpload } from 'filecoin-pin/core/upload'
import pino from 'pino'
import { useCallback, useState } from 'react'
import type { UploadProgress } from '../components/upload/upload-progress.tsx'
import { filecoinPinConfig } from '../lib/filecoin-pin/config.ts'
import { getSynapseClient } from '../lib/filecoin-pin/synapse.ts'

interface UploadState {
  isUploading: boolean
  progress: UploadProgress[]
  error?: string
}

const initialProgress: UploadProgress[] = [
  { step: 'creating-car', progress: 0, status: 'pending' },
  { step: 'announcing-cids', progress: 0, status: 'pending' },
  { step: 'finalizing-transaction', progress: 0, status: 'pending' },
]

export const useFilecoinUpload = () => {
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

  const uploadFile = useCallback(
    async (file: File): Promise<string> => {
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

        console.log('CAR result:', carResult)

        updateProgress('creating-car', { status: 'completed', progress: 100 })
        // creating the car is done, but its not uploaded yet.

        const synapse = await getSynapseClient(filecoinPinConfig)

        // validate that we can actually upload the car, passing the autoConfigureAllowances flag to true to automatically configure allowances if needed.
        const readinessCheck = await checkUploadReadiness({
          synapse,
          fileSize: carResult.carBytes.length,
          autoConfigureAllowances: true,
        })
        console.log('Readiness check:', readinessCheck)

        if (readinessCheck.status === 'blocked') {
          // TODO: show the user the reasons why the upload is blocked, prompt them to fix based on the suggestions.
          console.error('Readiness check failed:', readinessCheck)
          throw new Error('Readiness check failed')
        }

        // Create a simple logger for the upload
        const logger = pino({
          level: 'debug',
          browser: {
            asObject: true,
          },
        })

        // setup storage context and the SynapseService object:
        const storageContext = await createStorageContext(synapse, logger)
        const synapseService = {
          ...storageContext,
          synapse,
        }

        // Step 2: Upload CAR to Synapse (Filecoin SP)
        updateProgress('announcing-cids', { status: 'in-progress', progress: 0 })

        const uploadResult = await executeUpload(synapseService, carResult.carBytes, carResult.rootCid, {
          logger,
          contextId: `upload-${Date.now()}`,
          callbacks: {
            onUploadComplete: (pieceCid) => {
              console.log('Upload complete:', pieceCid)
              updateProgress('announcing-cids', { progress: 50 })
            },
            onPieceAdded: (transaction) => {
              console.log('Piece added:', transaction)
              updateProgress('announcing-cids', { progress: 75 })
            },
            onPieceConfirmed: (pieceIds) => {
              console.log('Piece confirmed:', pieceIds)
              updateProgress('announcing-cids', { progress: 100 })
            },
          },
        })

        console.log('Upload result:', uploadResult)

        updateProgress('announcing-cids', { status: 'completed', progress: 100 })

        // Step 3: Finalize storage transaction
        updateProgress('finalizing-transaction', { status: 'in-progress', progress: 0 })

        // The upload process includes transaction finalization
        // Simulate final processing time
        for (let i = 0; i <= 100; i += 20) {
          updateProgress('finalizing-transaction', { progress: i })
          await new Promise((resolve) => setTimeout(resolve, 100))
        }

        updateProgress('finalizing-transaction', { status: 'completed', progress: 100 })

        // Return the actual CID from the CAR result
        return carResult.rootCid.toString()
      } catch (error) {
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
    [updateProgress]
  )

  const resetUpload = useCallback(() => {
    setUploadState({
      isUploading: false,
      progress: initialProgress,
    })
  }, [])

  return {
    uploadState,
    uploadFile,
    resetUpload,
  }
}
