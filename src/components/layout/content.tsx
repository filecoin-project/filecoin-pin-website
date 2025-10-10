import { useContext, useEffect, useState } from 'react'
import { FilecoinPinContext } from '../../context/filecoin-pin-provider.tsx'
import { useDatasetPieces } from '../../hooks/use-dataset-pieces.ts'
import { useFilecoinUpload } from '../../hooks/use-filecoin-upload.ts'
import DragNDrop from '../upload/drag-n-drop.tsx'
import UploadProgress from '../upload/upload-progress.tsx'
import './content.css'
import { formatFileSize } from '../../utils/format-file-size.ts'
import PageTitle from '../ui/page-title.tsx'

export default function Content() {
  const [uploadedFile, setUploadedFile] = useState<{ file: File; cid: string } | null>(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const [expandedHistoryItems, setExpandedHistoryItems] = useState<Set<string>>(new Set())
  const { uploadState, uploadFile, resetUpload } = useFilecoinUpload()
  const { pieces: uploadHistory, refreshPieces, isLoading: isLoadingPieces } = useDatasetPieces()
  const context = useContext(FilecoinPinContext)
  if (!context) {
    throw new Error('Content must be used within FilecoinPinProvider')
  }

  const { providerInfo, wallet, synapse } = context

  // Determine if we're still initializing (wallet, synapse, provider, or pieces loading)
  const isInitializing =
    wallet.status === 'loading' || wallet.status === 'idle' || !synapse || !providerInfo || isLoadingPieces

  // Get loading message based on current state
  const getLoadingMessage = () => {
    if (wallet.status === 'loading' || wallet.status === 'idle') {
      return 'Connecting to Filecoin network...'
    }
    if (!synapse) {
      return 'Initializing storage service...'
    }
    if (!providerInfo) {
      return 'Selecting storage provider...'
    }
    if (isLoadingPieces) {
      return 'Loading your uploaded files...'
    }
    return 'Preparing upload interface...'
  }

  // If wallet failed to load, show error instead of spinner
  if (wallet.status === 'error') {
    return (
      <div className="content">
        <PageTitle />
        <div className="error-message">
          <p>Failed to connect to Filecoin network: {wallet.error}</p>
        </div>
      </div>
    )
  }

  const handleUpload = (filesToUpload: File[]) => {
    if (filesToUpload.length === 0) {
      alert('Please select files to upload')
      return
    }

    // For demo purposes, upload the first file
    const file = filesToUpload[0]
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
    const isUploadComplete = !uploadState.isUploading && uploadState.progress.every((p) => p.status === 'completed')
    if (isUploadComplete && uploadState.currentCid) {
      console.debug('[Content] Upload completed, refreshing pieces list')
      // Add a small delay to ensure the piece is indexed
      setTimeout(() => {
        refreshPieces()
      }, 2000)
    }
  }, [uploadState.isUploading, uploadState.progress, uploadState.currentCid, refreshPieces])

  return (
    <div className="content">
      <PageTitle />

      {/* Show upload history if no active upload */}
      {!uploadedFile && uploadHistory.length > 0 && (
        <div className="upload-history-section">
          <div className="upload-header">
            <h2>Uploaded files</h2>
          </div>
          {uploadHistory.map((upload) => (
            <UploadProgress
              cid={upload.cid}
              fileName={upload.fileName}
              fileSize={upload.fileSize}
              isExpanded={expandedHistoryItems.has(upload.id)}
              key={upload.id}
              network={upload.network}
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
              progress={[
                { step: 'creating-car', status: 'completed', progress: 100 },
                { step: 'checking-readiness', status: 'completed', progress: 100 },
                { step: 'uploading-car', status: 'completed', progress: 100 },
                { step: 'announcing-cids', status: 'completed', progress: 100 },
                { step: 'finalizing-transaction', status: 'completed', progress: 100 },
              ]}
              providerName={upload.providerName}
              transactionHash={upload.transactionHash}
            />
          ))}
        </div>
      )}

      {/* Show upload progress if uploading */}
      {uploadedFile ? (
        <div className="upload-progress-section">
          <UploadProgress
            cid={uploadState.currentCid}
            fileName={uploadedFile.file.name}
            fileSize={formatFileSize(uploadedFile.file.size)}
            isExpanded={isExpanded}
            network={wallet.status === 'ready' ? wallet.data.network : undefined}
            onToggleExpanded={() => setIsExpanded(!isExpanded)}
            pieceCid={uploadState.pieceCid}
            progress={uploadState.progress}
            providerName={providerInfo?.name || (providerInfo?.id ? String(providerInfo.id) : undefined)}
            transactionHash={uploadState.transactionHash}
          />
          {uploadState.error && (
            <div className="error-message">
              <p>Upload failed: {uploadState.error}</p>
              <button
                onClick={() => {
                  setUploadedFile(null)
                  resetUpload()
                }}
                type="button"
              >
                Try Again
              </button>
            </div>
          )}
          {!uploadState.isUploading && uploadState.progress.every((p) => p.status === 'completed') && (
            <div className="success-message">
              <p>✅ File successfully uploaded! CID: {uploadedFile.cid}</p>
              <button
                onClick={() => {
                  setUploadedFile(null)
                  resetUpload()
                }}
                type="button"
              >
                Upload Another File
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="upload-section">
          {isInitializing && (
            <div className="loading-pieces">
              <div className="loading-spinner"></div>
              <p>{getLoadingMessage()}</p>
            </div>
          )}
          <DragNDrop isUploading={uploadState.isUploading} onUpload={handleUpload} />
        </div>
      )}
    </div>
  )
}
