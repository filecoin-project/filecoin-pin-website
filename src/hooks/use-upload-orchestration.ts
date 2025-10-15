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
 * Single Responsibility: Coordinate active upload → history transition
 *
 * Handles:
 * - Starting uploads and tracking uploaded file metadata
 * - Detecting upload completion
 * - Refreshing history when upload completes
 * - Resetting active upload state
 * - Tracking CIDs that should be auto-expanded in history
 * - Auto-clearing upload state on error after timeout
 *
 * Does NOT:
 * - Render UI (that's components' job)
 * - Store history (that's UploadHistoryContext's job)
 * - Perform uploads (that's useFilecoinUpload's job)
 * - Manage expansion state (that's useUploadExpansion's job)
 *
 * @example
 * ```tsx
 * function Content() {
 *   const { startUpload, uploadedFile, activeUpload } = useUploadOrchestration()
 *
 *   return (
 *     <>
 *       <DragNDrop onUpload={startUpload} />
 *       {uploadedFile && (
 *         <UploadProgress
 *           fileName={uploadedFile.file.name}
 *           progresses={activeUpload.progress}
 *         />
 *       )}
 *     </>
 *   )
 * }
 * ```
 */
export function useUploadOrchestration() {
  const { uploadState, uploadFile, resetUpload } = useFilecoinUpload()
  const { addUpload } = useUploadHistory()
  const { storageContext, providerInfo, wallet } = useFilecoinPinContext()
  const { isCompleted } = useUploadProgress(uploadState.progress, uploadState.currentCid)

  // Track the file being uploaded (for displaying metadata like fileName)
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)

  // Track piece CIDs that should be auto-expanded when they appear in history
  const pendingAutoExpandPieceCidsRef = useRef<Set<string>>(new Set())

  // Key to force DragNDrop component to remount (clears internal file state)
  const [dragDropKey, setDragDropKey] = useState(0)

  /**
   * Handle upload completion:
   * 1. Mark piece CID for auto-expansion in history
   * 2. Add the upload to history (without refetching from backend)
   * 3. Clear active upload state
   * 4. Force DragNDrop remount to clear its state
   */
  useEffect(() => {
    if (isCompleted && uploadState.pieceCid && uploadedFile && storageContext && providerInfo) {
      console.debug('[UploadOrchestration] Upload completed, adding to history')

      // Mark this piece CID to be auto-expanded when it appears in history
      pendingAutoExpandPieceCidsRef.current = new Set(pendingAutoExpandPieceCidsRef.current).add(uploadState.pieceCid)

      // Build a DatasetPiece from the upload data we have
      const newPiece = {
        id: `piece-${uploadState.pieceCid}`,
        fileName: uploadedFile.file.name,
        fileSize: formatFileSize(uploadedFile.file.size),
        cid: uploadState.currentCid || '',
        pieceCid: uploadState.pieceCid,
        providerName: providerInfo.name || 'unknown',
        datasetId: String(storageContext.dataSetId),
        providerId: providerInfo.id.toString(),
        serviceURL: providerInfo.products?.PDP?.data?.serviceURL ?? '',
        transactionHash: uploadState.transactionHash || '',
        network: wallet?.status === 'ready' ? wallet.data.network : 'calibration',
        uploadedAt: Date.now(),
        pieceId: 0, // Placeholder - we don't have the backend pieceId yet
      }

      // Add to history without refetching
      addUpload(newPiece)

      // Clear the uploadedFile after adding to history so the upload form shows again
      setUploadedFile(null)
      resetUpload()
      // Increment key to force DragNDrop to remount and clear its state
      setDragDropKey((prev) => prev + 1)
    }
  }, [
    isCompleted,
    uploadState.pieceCid,
    uploadState.currentCid,
    uploadState.transactionHash,
    uploadedFile,
    storageContext,
    providerInfo,
    wallet,
    addUpload,
    resetUpload,
  ])

  /**
   * Auto-clear upload state on error after 5 seconds
   * This gives users time to see the error before resetting the UI
   */
  useEffect(() => {
    if (uploadState.error) {
      console.debug('[UploadOrchestration] Upload error detected, will auto-clear in 5 seconds')
      const timer = setTimeout(() => {
        setUploadedFile(null)
        resetUpload()
        // Increment key to force DragNDrop to remount and clear its state
        setDragDropKey((prev) => prev + 1)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [uploadState.error, resetUpload])

  /**
   * Start an upload and track the file metadata.
   * Sets uploadedFile immediately to switch UI to progress view.
   * Uploads in the background and updates with actual CID when complete.
   */
  const handleUpload = useCallback(
    (file: File) => {
      console.debug('[UploadOrchestration] Starting upload for file:', file.name)

      // Clear any pending auto-expand piece CIDs from previous uploads
      pendingAutoExpandPieceCidsRef.current = new Set()

      // Set uploadedFile immediately to switch to progress view
      setUploadedFile({ file, cid: '' })

      // Start upload in the background without blocking the handler
      uploadFile(file)
        .then((cid) => {
          console.debug('[UploadOrchestration] Upload returned CID:', cid)
          // Update with actual CID when upload completes
          setUploadedFile({ file, cid })
        })
        .catch((error) => {
          console.error('[UploadOrchestration] Upload failed:', error)
          // Keep the uploadedFile state so the error message shows in the progress view
        })
    },
    [uploadFile]
  )

  return {
    /**
     * The file currently being uploaded (with metadata like name, size)
     * null when no active upload
     */
    uploadedFile,

    /**
     * The current upload state (progress, CID, error, etc.)
     * This is the state from useFilecoinUpload
     */
    activeUpload: uploadState,

    /**
     * Set of piece CIDs that are pending auto-expansion in history
     * Used by useUploadExpansion to auto-expand newly uploaded items
     */
    pendingAutoExpandPieceCids: pendingAutoExpandPieceCidsRef.current,

    /**
     * Key to force DragNDrop component to remount
     * Increment this to clear the drag-n-drop internal state
     */
    dragDropKey,

    /**
     * Start uploading a file
     * @param file - File to upload
     */
    startUpload: handleUpload,
  }
}
