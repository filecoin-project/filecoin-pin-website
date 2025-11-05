import { Root, FormControl, FormField, FormMessage } from '@radix-ui/react-form'
import { useRef, useState } from 'react'
import { PlusIcon } from 'lucide-react'

import { ButtonBase as Button } from '../ui/button/button-base.tsx'
import { formatFileSize } from '@/utils/format-file-size.ts'

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
  maxSize = 200_000_000,
}: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onUpload(file)
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
    <Root className="inline-flex flex-col gap-2" onSubmit={(e) => e.preventDefault()}>
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
      <Button disabled={isUploading} loading={isUploading} onClick={handleButtonClick} type="button" variant="primary">
        <div className="flex items-center gap-2">
          <PlusIcon size={20} />
          <span>Add file</span>
        </div>
      </Button>
      <FormField name="file">
        <FormMessage className="text-sm text-red-500 mt-1">{error}</FormMessage>
      </FormField>
    </Root>
  )
}
