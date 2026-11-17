import { Root } from '@radix-ui/react-form'
import { Loader2 } from 'lucide-react'
import { MAX_FILE_SIZE } from '@/constants/files.ts'
import { FilePicker } from '../file-picker/index.tsx'
import { UploadNotes } from '../file-picker/upload-instructions.tsx'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'

interface DragNDropProps {
  onUpload: (files: File[]) => void
  files: File[]
  onFilesChange: (files: File[]) => void
  isUploading?: boolean
  isChecking?: boolean
}

export default function DragNDrop({ onUpload, files, onFilesChange, isUploading, isChecking }: DragNDropProps) {
  const fileIsSelected = files.length > 0
  const busy = isUploading || isChecking
  const buttonIsDisabled = !fileIsSelected || busy

  function uploadFile(e: React.MouseEvent) {
    e.preventDefault() // Prevent form submission
    if (files.length && !busy) {
      onUpload(files)
    }
  }

  function clearFile(e: React.MouseEvent) {
    e.preventDefault() // Prevent form submission
    onFilesChange([])
  }

  return (
    <Root className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <FilePicker disabled={busy} files={files} maxSize={MAX_FILE_SIZE} onChange={onFilesChange} />

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
            aria-busy={busy}
            className="w-auto min-w-24"
            disabled={buttonIsDisabled}
            loading={busy}
            onClick={uploadFile}
            size="sm"
            type="button"
            variant="primary"
          >
            {isChecking && <Loader2 aria-hidden="true" className="animate-spin" size={16} />}
            {isChecking ? 'Checking upload…' : files.length > 1 ? `Upload ${files.length} files` : 'Upload'}
          </Button>
        </div>
      </div>
    </Root>
  )
}
