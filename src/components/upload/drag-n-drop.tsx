import { Root } from '@radix-ui/react-form'
import { useState } from 'react'
import { MAX_FILE_SIZE } from '@/constants/files.ts'
import { FilePicker } from '../file-picker/index.tsx'
import { UploadNotes } from '../file-picker/upload-instructions.tsx'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'

interface DragNDropProps {
  onUpload: (files: File[]) => void
  isUploading?: boolean
}

export default function DragNDrop({ onUpload, isUploading }: DragNDropProps) {
  const [files, setFiles] = useState<File[]>([])

  const fileIsSelected = files.length > 0
  const buttonIsDisabled = !fileIsSelected || isUploading

  function uploadFile(e: React.MouseEvent) {
    e.preventDefault() // Prevent form submission
    if (files.length) {
      onUpload(files)
    }
  }

  function clearFile(e: React.MouseEvent) {
    e.preventDefault() // Prevent form submission
    setFiles([])
  }

  return (
    <Root className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <FilePicker disabled={isUploading} files={files} maxSize={MAX_FILE_SIZE} onChange={setFiles} />

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
            {files.length > 1 ? `Upload ${files.length} files` : 'Upload'}
          </Button>
        </div>
      </div>
    </Root>
  )
}
