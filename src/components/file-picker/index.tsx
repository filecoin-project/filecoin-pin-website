'use client'

import { FormField, FormLabel, FormControl } from '@radix-ui/react-form'

import { SelectedFile } from './selected-file'
import { UploadInstructions } from './upload-instructions'

export type FormFileInputProps = {
  file: File | null
  maxSize: number
  onChange: (file: File | null) => void
  accept?: Array<string> | ReadonlyArray<string>
}

export function FilePicker({
  file,
  onChange,
  maxSize,
  accept = ['*'],
  ...rest
}: FormFileInputProps) {
  return (
    <FormField name="file">
      <div className="group/container relative h-60 w-full md:h-52">
        {file ? (
          <SelectedFile file={file} onReset={resetFile} />
        ) : (
          <>
            <FormControl asChild>
              <input
                {...rest}
                type="file"
                accept={accept.join(',')}
                multiple={false}
                className="peer absolute inset-0 z-10 opacity-0 not-disabled:cursor-pointer disabled:cursor-not-allowed"
                onChange={loadFile}
              />
            </FormControl>
            <FormLabel asChild>
              <UploadInstructions maxSize={maxSize} />
            </FormLabel>
          </>
        )}
      </div>
    </FormField>
  )

  function resetFile() {
    onChange(null)
  }

  function loadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    onChange(files ? files[0] : null)
  }
}
