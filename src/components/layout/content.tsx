import { useState } from 'react'
import { useFilecoinUpload } from '../../hooks/use-filecoin-upload.ts'
import DragNDrop from '../upload/drag-n-drop.tsx'
import UploadProgress from '../upload/upload-progress.tsx'
import './content.css'
import { PageTitle } from '../ui/page-title.tsx'

export default function Content() {
  const [uploadedFile, setUploadedFile] = useState<{ file: File; cid: string } | null>(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const { uploadState, uploadFile, resetUpload } = useFilecoinUpload()

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

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
  }

  return (
    <div className="space-y-10">
      <PageTitle />

      {uploadedFile ? (
        <div className="upload-progress-section">
          <UploadProgress
            fileName={uploadedFile.file.name}
            fileSize={formatFileSize(uploadedFile.file.size)}
            isExpanded={isExpanded}
            onToggleExpanded={() => setIsExpanded(!isExpanded)}
            progress={uploadState.progress}
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
        <div className="space-y-6">
          <h2 className="text-xl font-medium text-white">Upload a file</h2>
          <DragNDrop isUploading={uploadState.isUploading} onUpload={handleUpload} />
        </div>
      )}
    </div>
  )
}
