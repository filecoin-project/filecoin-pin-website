import { FolderUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { type DirectoryUpload, directoryUpload } from '../../lib/filecoin-pin/upload-source.ts'
import { formatFileSize } from '../../utils/format-file-size.ts'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'

export function FolderPicker({
  onUpload,
  disabled = false,
}: {
  onUpload: (source: DirectoryUpload) => void
  disabled?: boolean
}) {
  const picker = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<DirectoryUpload | null>(null)
  const [error, setError] = useState('')
  return (
    <div className="space-y-4">
      <input
        aria-label="Select folder to upload"
        className="hidden"
        disabled={disabled}
        multiple
        onChange={(event) => {
          try {
            setSelected(directoryUpload(Array.from(event.target.files ?? [])))
            setError('')
          } catch (cause) {
            setSelected(null)
            setError(cause instanceof Error ? cause.message : 'Unable to select folder.')
          }
          event.target.value = ''
        }}
        ref={picker}
        type="file"
        {...{ webkitdirectory: '' }}
      />
      <button
        className="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-canvas/30 p-5 text-sm hover:bg-surface-raised focus:brand-outline"
        disabled={disabled}
        onClick={() => picker.current?.click()}
        type="button"
      >
        <FolderUp aria-hidden="true" className="text-accent" size={28} />
        {selected ? (
          <>
            <span className="break-all font-medium">{selected.name}</span>
            <span className="text-xs text-muted">
              {selected.files.length} files · {formatFileSize(selected.size)}
            </span>
          </>
        ) : (
          <>
            <span>Choose a folder</span>
            <span className="text-xs text-muted">Up to 200 MB in total</span>
          </>
        )}
      </button>
      <p className="text-xs text-muted">
        The folder is stored as one upload. Empty subfolders are not included by the browser picker.
      </p>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <Button
        className="w-auto"
        disabled={!selected || disabled}
        onClick={() => {
          if (selected) onUpload(selected)
        }}
        size="sm"
      >
        Upload folder
      </Button>
    </div>
  )
}
