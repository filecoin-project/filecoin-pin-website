import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import Button from '../ui/button.tsx'
import './drag-n-drop.css'

interface FileWithPreview extends File {
  preview?: string
}

interface DragNDropProps {
  onFilesSelected?: (files: File[]) => void
  onUpload?: (files: File[]) => void
  maxFiles?: number
  accept?: Record<string, string[]>
  isUploading?: boolean
}

export default function DragNDrop({
  onFilesSelected,
  onUpload,
  maxFiles,
  accept,
  isUploading = false,
}: DragNDropProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileWithPreview[]>([])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const filesWithPreview = acceptedFiles.map((file) =>
        Object.assign(file, {
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        })
      )

      setSelectedFiles((prev) => {
        const combined = [...prev, ...filesWithPreview]
        const limited = maxFiles ? combined.slice(0, maxFiles) : combined
        return limited
      })

      if (onFilesSelected) {
        const allFiles = [...selectedFiles, ...filesWithPreview]
        const limited = maxFiles ? allFiles.slice(0, maxFiles) : allFiles
        onFilesSelected(limited)
      }
    },
    [maxFiles, onFilesSelected, selectedFiles]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    accept,
  })

  const clearAllFiles = useCallback(() => {
    // Clean up all preview URLs
    for (const file of selectedFiles) {
      if (file.preview) {
        URL.revokeObjectURL(file.preview)
      }
    }

    setSelectedFiles([])
    if (onFilesSelected) {
      onFilesSelected([])
    }
  }, [selectedFiles, onFilesSelected])

  // Clean up previews on unmount
  useEffect(() => {
    return () => {
      for (const file of selectedFiles) {
        if (file.preview) {
          URL.revokeObjectURL(file.preview)
        }
      }
    }
  }, [selectedFiles])

  return (
    <div className="drag-n-drop-container">
      <div
        {...getRootProps()}
        className={`drop-zone ${isDragActive ? 'dragging' : ''} ${selectedFiles.length > 0 ? 'has-files' : ''}`}
      >
        <input {...getInputProps()} />

        <div className="drop-zone-icon">📁</div>
        <div className="drop-zone-text">
          {selectedFiles.length > 0 ? (
            <div className="file-names">
              {selectedFiles.slice(0, 3).map((file) => (
                <span className="file-name-badge" key={`${file.name}-${file.size}`}>
                  {file.name}
                </span>
              ))}
              {selectedFiles.length > 3 && (
                <span className="file-name-badge more">+{selectedFiles.length - 3} more</span>
              )}
            </div>
          ) : (
            <>
              <p className="drop-zone-primary">Drag and drop files here</p>
              <p className="drop-zone-secondary">
                or <span className="drop-zone-browse">browse files</span>
              </p>
            </>
          )}
        </div>
        {maxFiles && (
          <p className="drop-zone-hint">
            Maximum {maxFiles} file{maxFiles > 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="upload-actions">
        <Button disabled={selectedFiles.length === 0 || isUploading} onClick={clearAllFiles} size="md" variant="cancel">
          Cancel
        </Button>
        <Button
          disabled={selectedFiles.length === 0 || isUploading}
          isLoading={isUploading}
          onClick={() => onUpload?.(selectedFiles)}
          size="md"
          variant="primary"
        >
          Upload
        </Button>
      </div>
    </div>
  )
}
