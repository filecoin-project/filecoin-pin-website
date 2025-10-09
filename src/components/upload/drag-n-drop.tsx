import { useCallback, useContext, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import Button from '../ui/button.tsx'
import { FilecoinPinContext } from '../../context/filecoin-pin-provider.tsx'
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
  const context = useContext(FilecoinPinContext)
  if (!context) {
    throw new Error('DragNDrop must be used within FilecoinPinProvider')
  }
  const { dataSet, ensureDataSet, storageContext } = context

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

      // Trigger data set initialization when files are selected
      void ensureDataSet()
    },
    [maxFiles, onFilesSelected, selectedFiles, ensureDataSet]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    accept,
    onDragEnter: () => {
      // Trigger data set initialization when user hovers files over dropzone
      void ensureDataSet()
    },
  })

  const rootProps = getRootProps()

  // Trigger data set initialization when user clicks to open file picker
  const handleDropzoneClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    rootProps.onClick?.(event)
    void ensureDataSet()
  }, [ensureDataSet])

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
        {...rootProps}
        className={`drop-zone ${isDragActive ? 'dragging' : ''} ${selectedFiles.length > 0 ? 'has-files' : ''}`}
        onClick={handleDropzoneClick}
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
          disabled={selectedFiles.length === 0 || isUploading || !storageContext}
          isLoading={isUploading || dataSet.status === 'initializing'}
          onClick={() => onUpload?.(selectedFiles)}
          size="md"
          variant="primary"
        >
          {dataSet.status === 'initializing' ? 'Initializing...' : 'Upload'}
        </Button>
      </div>
    </div>
  )
}
