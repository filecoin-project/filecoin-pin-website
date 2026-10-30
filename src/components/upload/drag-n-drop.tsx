import { Root } from '@radix-ui/react-form'
import { useState } from 'react'
import { MAX_FILE_SIZE } from '@/constants/files.ts'
import { FilePicker } from '../file-picker/index.tsx'
import { UploadNotes } from '../file-picker/upload-instructions.tsx'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'

interface DragNDropProps {
  onFileSelected?: (file: File) => void
  onUpload: (file: File) => void
  isUploading?: boolean
}

export default function DragNDrop({ onFileSelected, onUpload, isUploading }: DragNDropProps) {
  const [file, setFile] = useState<File | null>(null)

  const fileIsSelected = Boolean(file)
  const buttonIsDisabled = !fileIsSelected || isUploading

  function uploadFile(e: React.MouseEvent) {
    e.preventDefault() // Prevent form submission
    if (file) {
      onUpload(file)
    }
  }

  function clearFile(e: React.MouseEvent) {
    e.preventDefault() // Prevent form submission
    setFile(null)
  }

  return (
    <Root className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <FilePicker
        disabled={isUploading}
        file={file}
        maxSize={MAX_FILE_SIZE}
        onChange={(file) => {
          setFile(file)
          if (file && onFileSelected) {
            onFileSelected(file)
          }
        }}
      />

      <UploadNotes />
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <Button
            className="w-auto min-w-24"
            disabled={buttonIsDisabled}
            onClick={clearFile}
            size="sm"
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            className="w-auto min-w-24"
            disabled={buttonIsDisabled}
            loading={isUploading}
            onClick={uploadFile}
            size="sm"
            type="button"
            variant="primary"
          >
            Upload
          </Button>
        </div>
      </div>
    </Root>
  )
}
