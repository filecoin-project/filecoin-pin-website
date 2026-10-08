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
      className="peer-focus:brand-outline group-hover/container:border-brand-700/60 group-hover/container:bg-brand-800/5 peer-focus:bg-surface-raised"
    >
      <div className="flex flex-col items-center justify-center gap-4 p-4 text-foreground">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-800/15 text-accent"
        >
          <UploadIcon size={22} />
        </span>

        <div className="space-y-1 text-center">
          <p>
            <span className="font-medium text-accent">Click to upload</span> or drag and drop a file
          </p>
          <p className="text-xs text-muted">Up to {prettyBytes(maxSize)} per file</p>
        </div>
      </div>
    </DashedContainer>
  )
}
