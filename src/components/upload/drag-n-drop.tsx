import { Root } from '@radix-ui/react-form'
import { useState } from 'react'
import { FilePicker } from '../file-picker/index.tsx'
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
      setFile(null)
    }
  }

  function clearFile(e: React.MouseEvent) {
    e.preventDefault() // Prevent form submission
    setFile(null)
  }

  return (
    <Root className="space-y-6" onSubmit={(e) => e.preventDefault()}>
      <FilePicker
        file={file}
        maxSize={1_000_000_000}
        onChange={(file) => {
          setFile(file)
          if (file && onFileSelected) {
            onFileSelected(file)
          }
        }}
      />

      <div className="flex justify-end">
        <div className="flex gap-4 items-center">
          <Button disabled={buttonIsDisabled} onClick={clearFile} type="button" variant="secondary">
            Cancel
          </Button>
          <Button
            disabled={buttonIsDisabled}
            loading={isUploading}
            onClick={uploadFile}
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
