import { useCallback, useEffect, useRef, useState } from 'react'
import { useUploadHistory } from '../context/upload-history-context.tsx'
import { formatFileSize } from '../utils/format-file-size.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'
import { useFilecoinUpload } from './use-filecoin-upload.ts'
import { useUploadProgress } from './use-upload-progress.ts'

interface UploadedFile {
  file: File
  cid: string
  id?: string
  folderPath?: string
  startedAt?: number
}

/**
 * Orchestrates the upload lifecycle: active upload -> history transition.
 *
 * Handles:
 * - Starting uploads and tracking uploaded file metadata
 * - Detecting upload completion and adding to history
 * - Resetting active upload state
 * - Tracking CIDs that should be auto-expanded in history
 *
 * Does NOT:
 * - Render UI (that's components' job)
 * - Store history (that's UploadHistoryContext's job)
 * - Perform uploads (that's useFilecoinUpload's job)
 * - Manage expansion state (that's useUploadExpansion's job)
 */
export function useUploadOrchestration() {
  const { uploadState, uploadFile, resetUpload } = useFilecoinUpload()
  const { addUpload } = useUploadHistory()
  const { wallet } = useFilecoinPinContext()
  const { uploadOutcome } = useUploadProgress({ stepStates: uploadState.stepStates, cid: uploadState.currentCid })

  const { isUploadSuccessful } = uploadOutcome

  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  // Piece CIDs that should be auto-expanded when they appear in history (consumed by useUploadExpansion)
  const pendingAutoExpandPieceCidsRef = useRef<Set<string>>(new Set())
  // Key to force DragNDrop remount (clears its internal file state)
  const [dragDropKey, setDragDropKey] = useState(0)

  /**
   * Handle upload completion:
   * Build DatasetPiece from the primary copy result and add to history.
   */
  useEffect(() => {
    if (!uploadState.pieceCid || !uploadedFile) {
      return
    }

    const copies =
      uploadState.copies ??
      uploadState.confirmedPieces?.map((copy, index) => ({
        ...copy,
        role: index === 0 ? 'primary' : 'secondary',
        retrievalUrl: '',
      }))
    if (!copies?.length) {
      return
    }
    const primary = copies.find((c) => c.role === 'primary')

    if (!primary) {
      return
    }

    console.debug('[UploadOrchestration] Upload completed, adding to history')

    pendingAutoExpandPieceCidsRef.current = new Set(pendingAutoExpandPieceCidsRef.current).add(uploadState.pieceCid)

    const providersById = uploadState.providersById
    const orderedCopies = [primary, ...copies.filter((c) => c.role !== 'primary')]
    const providerNameFor = (providerId: bigint | string) => providersById[String(providerId)]?.name ?? ''
    const serviceUrlFor = (c: (typeof copies)[number]) =>
      providersById[String(c.providerId)]?.pdp?.serviceURL ?? c.retrievalUrl ?? ''
    const transactionFor = (providerId: bigint) =>
      uploadState.confirmedPieces?.find((copy) => copy.providerId === providerId)?.transactionHash ?? ''

    const newPiece = {
      id: uploadedFile.id ?? crypto.randomUUID(),
      folderPath: uploadedFile.folderPath,
      ipfsIndexed: uploadState.stepStates.find((step) => step.step === 'announcing-cids')?.status === 'completed',
      pieceIds: orderedCopies.map((c) => String(c.pieceId)),
      fileName: uploadedFile.file.name,
      fileSize: formatFileSize(uploadedFile.file.size),
      cid: uploadState.currentCid || '',
      pieceCid: uploadState.pieceCid,
      providerName: providerNameFor(primary.providerId),
      datasetId: String(primary.dataSetId),
      providerId: String(primary.providerId),
      serviceURL: serviceUrlFor(primary),
      transactionHash:
        transactionFor(primary.providerId) || uploadState.transactionHashes[0] || uploadState.transactionHash || '',
      network: uploadState.network || (wallet?.status === 'ready' ? wallet.data.network : 'calibration'),
      uploadedAt: uploadedFile.startedAt ?? Date.now(),
      pieceId: Number(primary.pieceId),
      copyCount: copies.length,
      datasetIds: orderedCopies.map((c) => String(c.dataSetId)),
      providerIds: orderedCopies.map((c) => String(c.providerId)),
      providerNames: orderedCopies.map((c) => providerNameFor(c.providerId)),
      serviceURLs: orderedCopies.map(serviceUrlFor),
      transactionHashes: orderedCopies.map((copy) => transactionFor(copy.providerId)),
    }

    addUpload(newPiece)

    // Checkpoint confirmed storage before replication/indexing finish. Keep the
    // active operation and its lock until the SDK has actually returned.
    if (uploadState.isUploading || uploadState.error || !isUploadSuccessful || !uploadState.copies) return
    setUploadedFile(null)
    resetUpload()
    setDragDropKey((prev) => prev + 1)
  }, [
    isUploadSuccessful,
    uploadState.pieceCid,
    uploadState.currentCid,
    uploadState.transactionHash,
    uploadState.copies,
    uploadState.confirmedPieces,
    uploadState.isUploading,
    uploadState.error,
    uploadState.network,
    uploadState.providersById,
    uploadState.transactionHashes,
    uploadState.stepStates,
    uploadedFile,
    wallet,
    addUpload,
    resetUpload,
  ])

  const handleUpload = useCallback(
    (file: File, folderPath = '') => {
      console.debug('[UploadOrchestration] Starting upload for file:', file.name)

      pendingAutoExpandPieceCidsRef.current = new Set()

      const id = crypto.randomUUID()
      setUploadedFile({ file, cid: '', id, folderPath, startedAt: Date.now() })

      // Upload in background (not awaited) so handler returns immediately
      uploadFile(file)
        .then((cid) => {
          console.debug('[UploadOrchestration] Upload returned CID:', cid)
          setUploadedFile((current) => (current?.id === id ? { ...current, cid } : current))
        })
        .catch((error) => {
          // Keep uploadedFile state so the error shows in the progress view
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
    handleUpload(uploadedFile.file, uploadedFile.folderPath)
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
