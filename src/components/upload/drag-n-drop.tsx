import { Root } from '@radix-ui/react-form'
import { useContext, useState } from 'react'
import { FilecoinPinContext } from '../../context/filecoin-pin-provider.tsx'
import { FilePicker } from '../file-picker/index.tsx'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'

interface DragNDropProps {
  onFileSelected?: (file: File) => void
  onUpload: (file: File) => void
  isUploading?: boolean
}

export default function DragNDrop({ onFileSelected, onUpload, isUploading }: DragNDropProps) {
  const [file, setFile] = useState<File | null>(null)

  const context = useContext(FilecoinPinContext)

  if (!context) {
    throw new Error('DragNDrop must be used within FilecoinPinProvider')
  }

  const fileIsSelected = Boolean(file)
  const buttonIsDisabled = !fileIsSelected || isUploading

  function uploadFile() {
    if (file) {
      onUpload(file)
      setFile(null)
    }
  }

  function clearFile() {
    setFile(null)
  }

  return (
    <Root className="space-y-6">
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
          <Button disabled={buttonIsDisabled} onClick={clearFile} variant="secondary">
            Cancel
          </Button>
          <Button disabled={buttonIsDisabled} loading={isUploading} onClick={uploadFile} variant="primary">
            Upload
          </Button>
        </div>
      </div>
    </Root>
  )
}
