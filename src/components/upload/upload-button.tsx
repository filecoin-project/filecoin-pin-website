import { FormControl, FormField, FormMessage, Root } from '@radix-ui/react-form'
import { PlusIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { MAX_FILE_SIZE } from '@/constants/files.ts'
import { formatFileSize } from '@/utils/format-file-size.ts'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'

interface UploadButtonProps {
  onUpload: (file: File) => void
  isUploading?: boolean
  accept?: string[]
  maxSize?: number
}

export function UploadButton({
  onUpload,
  isUploading = false,
  accept = ['*'],
  maxSize = MAX_FILE_SIZE,
}: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  function handleButtonClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > maxSize) {
        setError(`File is too large. Maximum size is ${formatFileSize(maxSize)}.`)
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }

      setError(null)
      onUpload(file)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <Root className="flex flex-col gap-2 items-end" onSubmit={(e) => e.preventDefault()}>
      <FormField name="file">
        <FormControl asChild>
          <input
            accept={accept.join(',')}
            className="hidden"
            multiple={false}
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
        </FormControl>
      </FormField>
      <div className="w-content">
        <Button
          disabled={isUploading}
          loading={isUploading}
          onClick={handleButtonClick}
          type="button"
          variant="primary"
        >
          <div className="flex items-center gap-2">
            <PlusIcon size={20} />
            <span>Add file</span>
          </div>
        </Button>
      </div>
      <div className="h-3">
        {error && (
          <FormField name="file">
            <FormMessage className="text-sm text-red-500 mt-1 break-words max-w-full">{error}</FormMessage>
          </FormField>
        )}
      </div>
    </Root>
  )
}
