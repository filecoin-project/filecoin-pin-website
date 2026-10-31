'use client'

import { FormControl, FormField, FormLabel } from '@radix-ui/react-form'
import prettyBytes from 'pretty-bytes'
import { useId, useState } from 'react'
import { SelectedFile, SelectedFiles } from '../file-picker/selected-file.tsx'
import { UploadInstructions } from '../file-picker/upload-instructions.tsx'

export type FormFileInputProps = {
  files: File[]
  maxSize: number
  disabled?: boolean
  onChange: (files: File[]) => void
  accept?: Array<string> | ReadonlyArray<string>
}

export function FilePicker({ files, onChange, maxSize, disabled, accept = ['*'], ...rest }: FormFileInputProps) {
  const [error, setError] = useState('')
  const errorId = useId()
  return (
    <FormField name="file">
      <div className="group/container relative h-60 w-full md:h-52">
        {files.length ? (
          files.length === 1 ? (
            <SelectedFile disabled={disabled} file={files[0]} onReset={resetFile} />
          ) : (
            <SelectedFiles
              disabled={disabled}
              files={files}
              onRemove={(index) => onChange(files.filter((_file, i) => i !== index))}
              onReset={resetFile}
            />
          )
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
                multiple
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
    onChange([])
  }

  function loadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const next = Array.from(e.target.files ?? [])
    const oversized = next.find((file) => file.size > maxSize)
    if (oversized) {
      setError(`${oversized.name} is too large. Maximum size is ${prettyBytes(maxSize)} per file.`)
      e.target.value = ''
      onChange([])
      return
    }
    setError('')
    onChange(next)
    e.target.value = ''
  }
}
