import { Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { MAX_FILE_SIZE } from '../../constants/files.ts'
import { type DirectoryUpload, directoryUpload } from '../../lib/filecoin-pin/upload-source.ts'
import { SelectedFile } from '../file-picker/selected-file.tsx'
import { UploadInstructions, UploadNotes } from '../file-picker/upload-instructions.tsx'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'

export function FolderPicker({
  onUpload,
  disabled = false,
  isChecking = false,
  selection,
  onSelectionChange,
}: {
  onUpload: (source: DirectoryUpload) => void
  disabled?: boolean
  isChecking?: boolean
  selection?: DirectoryUpload | null
  onSelectionChange?: (selection: DirectoryUpload | null) => void
}) {
  const busy = disabled || isChecking
  const picker = useRef<HTMLInputElement>(null)
  const [localSelection, setLocalSelection] = useState<DirectoryUpload | null>(null)
  const selected = selection === undefined ? localSelection : selection
  const setSelected = onSelectionChange ?? setLocalSelection
  const [error, setError] = useState('')
  const reset = () => {
    setSelected(null)
    setError('')
  }
  return (
    <div className="space-y-4">
      <input
        aria-label="Select folder to upload"
        className="hidden"
        disabled={busy}
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
      <div className="group/container relative h-60 w-full md:h-52">
        {selected ? (
          <SelectedFile count={selected.files.length} disabled={busy} file={selected} kind="folder" onReset={reset} />
        ) : (
          <button
            aria-label="Choose a folder"
            className="h-full w-full rounded-xl focus:brand-outline disabled:cursor-not-allowed"
            disabled={busy}
            onClick={() => picker.current?.click()}
            type="button"
          >
            <UploadInstructions kind="folder" maxSize={MAX_FILE_SIZE} />
          </button>
        )}
      </div>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <UploadNotes kind="folder" />
      <div className="flex justify-end gap-2">
        <Button
          className="w-auto min-w-24"
          disabled={!selected || busy}
          onClick={reset}
          size="sm"
          type="button"
          variant="secondary"
        >
          Cancel
        </Button>
        <Button
          aria-busy={isChecking}
          className="w-auto min-w-24"
          disabled={!selected || busy}
          loading={isChecking}
          onClick={() => {
            if (selected && !busy) onUpload(selected)
          }}
          size="sm"
          type="button"
        >
          {isChecking && <Loader2 aria-hidden="true" className="animate-spin" size={16} />}
          {isChecking ? 'Checking upload…' : 'Upload'}
        </Button>
      </div>
    </div>
  )
}
