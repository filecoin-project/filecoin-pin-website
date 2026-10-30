'use client'

import { FormControl, FormField, FormLabel } from '@radix-ui/react-form'
import prettyBytes from 'pretty-bytes'
import { useId, useState } from 'react'
import { SelectedFile } from '../file-picker/selected-file.tsx'
import { UploadInstructions } from '../file-picker/upload-instructions.tsx'

export type FormFileInputProps = {
  file: File | null
  maxSize: number
  disabled?: boolean
  onChange: (file: File | null) => void
  accept?: Array<string> | ReadonlyArray<string>
}

export function FilePicker({ file, onChange, maxSize, disabled, accept = ['*'], ...rest }: FormFileInputProps) {
  const [error, setError] = useState('')
  const errorId = useId()
  return (
    <FormField name="file">
      <div className="group/container relative h-60 w-full md:h-52">
        {file ? (
          <SelectedFile disabled={disabled} file={file} onReset={resetFile} />
        ) : (
          <>
            <FormControl asChild>
              <input
                {...rest}
                accept={accept.join(',')}
                aria-describedby={error ? errorId : undefined}
                aria-invalid={Boolean(error)}
                className="peer absolute inset-0 z-10 opacity-0 not-disabled:cursor-pointer disabled:cursor-not-allowed"
                disabled={disabled}
                multiple={false}
                onChange={loadFile}
                type="file"
              />
            </FormControl>
            <FormLabel asChild>
              <UploadInstructions maxSize={maxSize} />
            </FormLabel>
          </>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm text-danger" id={errorId} role="alert">
          {error}
        </p>
      )}
    </FormField>
  )

  function resetFile() {
    setError('')
    onChange(null)
  }

  function loadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null
    if (next && next.size > maxSize) {
      setError(`File is too large. Maximum size is ${prettyBytes(maxSize)}.`)
      e.target.value = ''
      onChange(null)
      return
    }
    setError('')
    onChange(next)
  }
}
