'use client'

import { UploadIcon } from 'lucide-react'
import prettyBytes from 'pretty-bytes'
import { DashedContainer, type DashedContainerProps } from './dashed-container.tsx'
import type { FormFileInputProps } from './index.tsx'

type UploadInstructionsProps = Pick<FormFileInputProps, 'maxSize'> & DashedContainerProps

export function UploadInstructions({ maxSize, ...rest }: UploadInstructionsProps) {
  return (
    <DashedContainer
      {...rest}
      aria-label="Instructions to upload a file"
      className="peer-focus:brand-outline group-hover/container:border-zinc-500 group-hover/container:bg-zinc-900 peer-focus:bg-zinc-900"
    >
      <div className="flex flex-col items-center justify-center gap-5 p-4 text-zinc-300">
        <span aria-hidden="true" className="rounded-full bg-zinc-700 p-3">
          <UploadIcon size={28} />
        </span>

        <div className="space-y-1 text-center">
          <p>
            <span className="font-medium text-brand-500">Click to upload</span> or drag and drop
          </p>
          <p className="text-sm">(Up to {prettyBytes(maxSize)})</p>
        </div>
      </div>
    </DashedContainer>
  )
}
