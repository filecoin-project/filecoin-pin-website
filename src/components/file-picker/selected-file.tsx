'use client'

import { File, FolderUp, XIcon } from 'lucide-react'
import { formatFileSize } from '../../utils/format-file-size.ts'
import { DashedContainer } from './dashed-container.tsx'

type SelectedFileProps = {
  file: Pick<File, 'name' | 'size'>
  onReset: () => void
  kind?: 'file' | 'folder'
  count?: number
  disabled?: boolean
}

export function SelectedFile({ file, onReset, kind = 'file', count, disabled }: SelectedFileProps) {
  const Icon = kind === 'folder' ? FolderUp : File
  return (
    <DashedContainer className="relative">
      <div className="flex min-w-0 flex-col items-center gap-4 text-center text-sm">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-800/15 text-accent"
        >
          <Icon size={22} />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="break-all font-medium text-foreground">{file.name}</p>
          <p className="text-xs text-muted">
            {kind === 'folder' && `${count ?? 0} files · `}
            {formatFileSize(file.size)}
          </p>
        </div>
      </div>
      <button
        aria-label={`Remove selected ${kind}`}
        className="absolute right-3 top-3 rounded-lg p-2 text-muted hover:bg-surface-raised hover:text-foreground focus:brand-outline disabled:opacity-40"
        disabled={disabled}
        onClick={onReset}
        type="button"
      >
        <XIcon aria-hidden="true" size={16} />
      </button>
    </DashedContainer>
  )
}
