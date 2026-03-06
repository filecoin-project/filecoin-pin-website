import { useCallback, useEffect, useRef, useState } from 'react'
import { useUploadHistory } from '../context/upload-history-context.tsx'
import { formatFileSize } from '../utils/format-file-size.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'
import { useFilecoinUpload } from './use-filecoin-upload.ts'
import { useUploadProgress } from './use-upload-progress.ts'

interface UploadedFile {
  file: File
  cid: string
}

/**
 * Orchestrates the upload lifecycle and state transitions.
 *
 * Handles:
 * - Starting uploads and tracking uploaded file metadata
 * - Detecting upload completion
 * - Refreshing history when upload completes
 * - Resetting active upload state
 * - Tracking CIDs that should be auto-expanded in history
 * - Auto-clearing upload state on error after timeout
 */
export function useUploadOrchestration() {
  const { uploadState, uploadFile, resetUpload } = useFilecoinUpload()
  const { addUpload } = useUploadHistory()
  const { wallet } = useFilecoinPinContext()
  const { uploadOutcome } = useUploadProgress({ stepStates: uploadState.stepStates, cid: uploadState.currentCid })

  const { isUploadSuccessful } = uploadOutcome

  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const pendingAutoExpandPieceCidsRef = useRef<Set<string>>(new Set())
  const [dragDropKey, setDragDropKey] = useState(0)

  /**
   * Handle upload completion:
   * Build DatasetPiece from the primary copy result and add to history.
   */
  useEffect(() => {
    if (!isUploadSuccessful || !uploadState.pieceCid || !uploadedFile) {
      return
    }

    const copies = uploadState.copies
    if (!copies) {
      return
    }
    const primary = copies.find((c) => c.role === 'primary')

    if (!primary) {
      return
    }

    console.debug('[UploadOrchestration] Upload completed, adding to history')

    pendingAutoExpandPieceCidsRef.current = new Set(pendingAutoExpandPieceCidsRef.current).add(uploadState.pieceCid)

    const newPiece = {
      id: `piece-${uploadState.pieceCid}`,
      fileName: uploadedFile.file.name,
      fileSize: formatFileSize(uploadedFile.file.size),
      cid: uploadState.currentCid || '',
      pieceCid: uploadState.pieceCid,
      providerName: '',
      datasetId: String(primary.dataSetId),
      providerId: String(primary.providerId),
      serviceURL: primary.retrievalUrl || '',
      transactionHash: uploadState.transactionHash || '',
      network: uploadState.network || (wallet?.status === 'ready' ? wallet.data.network : 'calibration'),
      uploadedAt: Date.now(),
      pieceId: Number(primary.pieceId),
      copyCount: copies.length,
      datasetIds: copies.map((c) => String(c.dataSetId)),
    }

    addUpload(newPiece)

    setUploadedFile(null)
    resetUpload()
    setDragDropKey((prev) => prev + 1)
  }, [
    isUploadSuccessful,
    uploadState.pieceCid,
    uploadState.currentCid,
    uploadState.transactionHash,
    uploadState.copies,
    uploadState.network,
    uploadedFile,
    wallet,
    addUpload,
    resetUpload,
  ])

  const handleUpload = useCallback(
    (file: File) => {
      console.debug('[UploadOrchestration] Starting upload for file:', file.name)

      pendingAutoExpandPieceCidsRef.current = new Set()

      setUploadedFile({ file, cid: '' })

      uploadFile(file)
        .then((cid) => {
          console.debug('[UploadOrchestration] Upload returned CID:', cid)
          setUploadedFile({ file, cid })
        })
        .catch((error) => {
          console.error('[UploadOrchestration] Upload failed:', error)
        })
    },
    [uploadFile]
  )

  const cancelUpload = useCallback(() => {
    console.debug('[UploadOrchestration] Canceling upload')
    setUploadedFile(null)
    resetUpload()
    setDragDropKey((prev) => prev + 1)
  }, [resetUpload])

  const retryUpload = useCallback(() => {
    if (!uploadedFile) {
      console.warn('[UploadOrchestration] Cannot retry: no file in uploadedFile state')
      return
    }
    console.debug('[UploadOrchestration] Retrying upload for file:', uploadedFile.file.name)
    handleUpload(uploadedFile.file)
  }, [uploadedFile, handleUpload])

  return {
    uploadedFile,
    activeUpload: uploadState,
    pendingAutoExpandPieceCids: pendingAutoExpandPieceCidsRef.current,
    dragDropKey,
    startUpload: handleUpload,
    retryUpload,
    cancelUpload,
  }
}
