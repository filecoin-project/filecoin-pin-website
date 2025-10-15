import { useEffect, useRef, useState } from 'react'
import { Alert } from '@/components/ui/alert.tsx'
import type { Progress } from '@/types/upload-progress.ts'
import { useDatasetPieces } from '../../hooks/use-dataset-pieces.ts'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { useFilecoinUpload } from '../../hooks/use-filecoin-upload.ts'
import { useUploadProgress } from '../../hooks/use-upload-progress.ts'
import { formatFileSize } from '../../utils/format-file-size.ts'
import { Heading } from '../ui/heading.tsx'
import { LoadingState } from '../ui/loading-state.tsx'
import { PageTitle } from '../ui/page-title.tsx'
import DragNDrop from '../upload/drag-n-drop.tsx'
import { UploadStatus } from '../upload/upload-status.tsx'

// Completed state for displaying upload history
const COMPLETED_PROGRESS: Progress[] = [
  { step: 'creating-car', status: 'completed', progress: 100 },
  { step: 'checking-readiness', status: 'completed', progress: 100 },
  { step: 'uploading-car', status: 'completed', progress: 100 },
  { step: 'announcing-cids', status: 'completed', progress: 100 },
  { step: 'finalizing-transaction', status: 'completed', progress: 100 },
]

export default function Content() {
  const [uploadedFile, setUploadedFile] = useState<{ file: File; cid: string } | null>(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const [expandedHistoryItems, setExpandedHistoryItems] = useState<Set<string>>(new Set())
  const pendingAutoExpandCidsRef = useRef<Set<string>>(new Set()) // CIDs waiting to be auto-expanded when they appear in history
  const [dragDropKey, setDragDropKey] = useState(0) // Key to force DragNDrop remount
  const { uploadState, uploadFile, resetUpload } = useFilecoinUpload()
  const { pieces: uploadHistory, refreshPieces, isLoading: isLoadingPieces } = useDatasetPieces()
  const { wallet, synapse } = useFilecoinPinContext()
  const { isCompleted: isActiveUploadComplete } = useUploadProgress(uploadState.progress, uploadState.currentCid)

  // Determine if we're still initializing (wallet, synapse, provider)
  // Note: We don't block on isLoadingPieces - users can upload while history loads
  const isInitializing = wallet.status === 'loading' || wallet.status === 'idle'

  // Get loading message based on current state
  const getLoadingMessage = () => {
    if (wallet.status === 'loading' || wallet.status === 'idle') {
      return 'Connecting to Filecoin network...'
    }
    if (!synapse) {
      return 'Initializing storage service...'
    }
    return 'Preparing upload interface...'
  }

  // If wallet failed to load, show error instead of spinner
  if (wallet.status === 'error') {
    return (
      <div className="space-y-10">
        <PageTitle />
        <Alert message={`Failed to connect to Filecoin network: ${wallet.error}`} variant="error" />
      </div>
    )
  }

  const handleUpload = (file: File) => {
    // Set uploadedFile immediately to switch to progress view
    setUploadedFile({ file, cid: '' })

    // Start upload in the background without blocking the handler
    uploadFile(file)
      .then((cid) => {
        // Update with actual CID when upload completes
        setUploadedFile({ file, cid })
      })
      .catch((error) => {
        console.error('Upload failed:', error)
        // Keep the uploadedFile state so the error message shows in the progress view
      })
  }

  // Refresh pieces list when upload completes
  useEffect(() => {
    if (isActiveUploadComplete && uploadState.currentCid) {
      console.debug('[Content] Upload completed, refreshing pieces list')

      // Mark this CID to be auto-expanded when it appears in history
      pendingAutoExpandCidsRef.current = new Set(pendingAutoExpandCidsRef.current).add(uploadState.currentCid)

      // Add a small delay to ensure the piece is indexed
      setTimeout(() => {
        refreshPieces()
        // Clear the uploadedFile after adding to history so the upload form shows again
        setUploadedFile(null)
        resetUpload()
        // Increment key to force DragNDrop to remount and clear its state
        setDragDropKey((prev) => prev + 1)
      }, 2000)
    }
  }, [isActiveUploadComplete, uploadState.currentCid, refreshPieces, resetUpload])

  // Auto-expand items when they appear in history (only once per upload)
  useEffect(() => {
    if (uploadHistory.length === 0) return

    const pending = pendingAutoExpandCidsRef.current
    if (pending.size === 0) return

    const nextPending = new Set<string>()
    const idsToExpand: string[] = []

    pending.forEach((cid) => {
      const piece = uploadHistory.find((p) => p.cid === cid)
      if (piece) {
        idsToExpand.push(piece.id)
      } else {
        nextPending.add(cid)
      }
    })

    if (idsToExpand.length > 0) {
      setExpandedHistoryItems((prev) => {
        const next = new Set(prev)
        idsToExpand.forEach((id) => {
          next.add(id)
        })
        return next
      })
    }

    pendingAutoExpandCidsRef.current = nextPending
  }, [uploadHistory])

  // Auto-clear upload state on error
  useEffect(() => {
    if (uploadState.error) {
      // Keep showing the error for a bit, then auto-clear after 5 seconds
      const timer = setTimeout(() => {
        setUploadedFile(null)
        resetUpload()
        // Increment key to force DragNDrop to remount and clear its state
        setDragDropKey((prev) => prev + 1)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [uploadState.error, resetUpload])

  return (
    <div className="space-y-10">
      <PageTitle />
      <Alert
        message="This demo runs on Filecoin Calibration testnet, where data isn't permanent and infrastructure resets regularly."
        variant="neutral"
      />

      {/* Show drag-n-drop only when not uploading */}
      {!uploadedFile && (
        <div className="space-y-6">
          <Heading tag="h2">Upload a file</Heading>
          <DragNDrop isUploading={uploadState.isUploading} key={dragDropKey} onUpload={handleUpload} />
        </div>
      )}

      {/* Show active upload progress */}
      {uploadedFile && (
        <div className="space-y-6">
          <Heading tag="h2">Current upload</Heading>
          <UploadStatus
            cid={uploadState.currentCid}
            fileName={uploadedFile.file.name}
            fileSize={formatFileSize(uploadedFile.file.size)}
            isExpanded={isExpanded}
            onToggleExpanded={() => setIsExpanded(!isExpanded)}
            pieceCid={uploadState.pieceCid ?? ''}
            progresses={uploadState.progress}
            transactionHash={uploadState.transactionHash ?? ''}
          />
        </div>
      )}

      {(isLoadingPieces || isInitializing) && uploadHistory.length === 0 && (
        <LoadingState message={getLoadingMessage()} />
      )}
      {/* Always show upload history when available */}
      {uploadHistory.length > 0 && (
        <div className="space-y-6">
          <Heading tag="h2">Uploaded files</Heading>
          {uploadHistory.map((upload) => (
            <UploadStatus
              cid={upload.cid}
              datasetId={upload.datasetId}
              fileName={upload.fileName}
              fileSize={upload.fileSize}
              isExpanded={expandedHistoryItems.has(upload.id)}
              key={upload.id}
              onToggleExpanded={() => {
                setExpandedHistoryItems((prev) => {
                  const next = new Set(prev)
                  if (next.has(upload.id)) {
                    next.delete(upload.id)
                  } else {
                    next.add(upload.id)
                  }
                  return next
                })
              }}
              pieceCid={upload.pieceCid}
              progresses={COMPLETED_PROGRESS}
              transactionHash={upload.transactionHash}
            />
          ))}
        </div>
      )}
    </div>
  )
}
