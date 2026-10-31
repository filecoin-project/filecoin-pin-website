'use client'

import { FolderUp, UploadIcon } from 'lucide-react'
import prettyBytes from 'pretty-bytes'
import { DashedContainer, type DashedContainerProps } from './dashed-container.tsx'
import type { FormFileInputProps } from './index.tsx'

type UploadInstructionsProps = Pick<FormFileInputProps, 'maxSize'> & DashedContainerProps & { kind?: 'file' | 'folder' }

export function UploadInstructions({ maxSize, kind = 'file', ...rest }: UploadInstructionsProps) {
  const Icon = kind === 'folder' ? FolderUp : UploadIcon
  return (
    <DashedContainer
      {...rest}
      aria-label={`Instructions to upload a ${kind}`}
      className="peer-focus:brand-outline group-hover/container:border-brand-700/60 group-hover/container:bg-brand-800/5 peer-focus:bg-surface-raised"
    >
      <div className="flex flex-col items-center justify-center gap-4 p-4 text-foreground">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-800/15 text-accent"
        >
          <Icon size={22} />
        </span>
        <div className="space-y-1 text-center text-sm">
          <p>
            <span className="font-medium text-accent">{kind === 'folder' ? 'Choose a folder' : 'Choose files'}</span>
            {kind === 'file' && ' or drag and drop'}
          </p>
          <p className="text-xs text-muted">
            Up to {prettyBytes(maxSize)} {kind === 'folder' ? 'in total' : 'per file'}
          </p>
        </div>
      </div>
    </DashedContainer>
  )
}

export function UploadNotes({ kind = 'file' }: { kind?: 'file' | 'folder' }) {
  return (
    <details className="text-xs leading-relaxed text-muted">
      <summary className="w-fit cursor-pointer hover:text-foreground">About this upload</summary>
      <p className="mt-2">
        {kind === 'folder'
          ? 'The folder is stored as one upload. Empty subfolders are not included by the browser picker.'
          : 'Existing CAR archives are imported unchanged; the first root is used as the primary CID.'}
      </p>
      <p className="mt-2">
        Uploaded content is not encrypted. Original file names and content identifiers may be publicly visible on-chain.
      </p>
    </details>
  )
}
