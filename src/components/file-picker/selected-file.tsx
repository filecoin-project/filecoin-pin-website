'use client'

import { File, FolderUp, XIcon } from 'lucide-react'
import { useRef } from 'react'
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

export function SelectedFiles({
  files,
  onRemove,
  onReset,
  disabled,
}: {
  files: File[]
  onRemove: (index: number) => void
  onReset: () => void
  disabled?: boolean
}) {
  const ids = useRef(new WeakMap<File, string>())
  const keyFor = (file: File) => {
    let id = ids.current.get(file)
    if (!id) {
      id = crypto.randomUUID()
      ids.current.set(file, id)
    }
    return id
  }
  return (
    <DashedContainer className="relative">
      <div className="w-full min-w-0 space-y-3 px-4 text-sm">
        <p className="pr-8 font-medium">{files.length} files selected</p>
        <ul aria-label="Selected files" className="max-h-28 space-y-2 overflow-y-auto">
          {files.map((file, index) => (
            <li className="flex min-w-0 items-center gap-2" key={keyFor(file)}>
              <File aria-hidden="true" className="shrink-0 text-accent" size={16} />
              <span className="min-w-0 flex-1 truncate" title={file.name}>
                {file.name}
              </span>
              <span className="shrink-0 text-xs text-muted">{formatFileSize(file.size)}</span>
              <button
                aria-label={`Remove ${file.name} from selection`}
                className="rounded p-1 text-muted hover:text-foreground"
                disabled={disabled}
                onClick={() => onRemove(index)}
                type="button"
              >
                <XIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button
        aria-label="Remove selected files"
        className="absolute right-3 top-3 rounded-lg p-2 text-muted hover:bg-surface-raised hover:text-foreground"
        disabled={disabled}
        onClick={onReset}
        type="button"
      >
        <XIcon size={16} />
      </button>
    </DashedContainer>
  )
}
