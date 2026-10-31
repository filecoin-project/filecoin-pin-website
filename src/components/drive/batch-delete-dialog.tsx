import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { displayFileName } from '../../lib/filecoin-pin/drive-api.ts'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'
import { SidePanel } from './side-panel.tsx'

export function BatchDeleteDialog({
  open,
  onOpenChange,
  targets,
  aliases,
  authorized,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  targets: DatasetPiece[]
  aliases: DatasetPiece[]
  authorized: boolean
  busy: boolean
  onConfirm: () => void
}) {
  const [consent, setConsent] = useState(false)
  const [hintAttempt, setHintAttempt] = useState(0)
  return (
    <SidePanel
      description="Review the files and stored copies affected by this deletion."
      onOpenChange={(value) => {
        setConsent(false)
        setHintAttempt(0)
        onOpenChange(value)
      }}
      open={open}
      title="Delete selected files"
    >
      <p className="text-sm">
        {aliases.length} file records · {targets.length} unique uploads
      </p>
      <ul
        aria-label="Files affected by deletion"
        className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border p-3 text-sm"
      >
        {aliases.map((file) => (
          <li className="break-words" key={file.id}>
            {[file.folderPath, displayFileName(file)].filter(Boolean).join('/')}
          </li>
        ))}
      </ul>
      {aliases.length > targets.length && (
        <p className="text-sm text-warning">
          Files with identical content share storage. All listed records will be affected.
        </p>
      )}
      {targets.some((file) => file.isDirectory) && (
        <p className="text-sm text-muted">Uploaded folders and their contents are deleted as a whole.</p>
      )}
      <p className="text-sm text-muted">
        Removal may take some time. You can close this panel after starting deletion.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
        Delete all listed files and their recorded copies.
      </label>
      <Button
        aria-disabled={!authorized || undefined}
        className={authorized ? undefined : 'opacity-50 cursor-not-allowed'}
        disabled={busy || !targets.length || (authorized && !consent)}
        onClick={() => {
          if (authorized) onConfirm()
          else setHintAttempt((value) => value + 1)
        }}
        size="sm"
        variant="danger"
      >
        <Trash2 aria-hidden="true" size={14} />
        Delete selected files
      </Button>
      {!authorized && (
        <p
          className={`rounded-md text-sm text-muted ${hintAttempt ? 'animate-session-hint' : ''}`}
          key={hintAttempt}
          role={hintAttempt ? 'alert' : undefined}
        >
          Authorize a browser session in Wallet setup first.
        </p>
      )}
    </SidePanel>
  )
}
