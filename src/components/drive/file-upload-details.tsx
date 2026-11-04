import { useRef, useState } from 'react'
import { useUploadHistory } from '../../context/upload-history-context.tsx'
import { useUploadTasks } from '../../context/upload-tasks-context.tsx'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { getTxExplorerLink } from '../../utils/links.ts'
import { copyProgress, fileStatus, fileStatusColors } from '../../utils/upload/file-status.ts'
import { getStepLabel } from '../../utils/upload/step-utils.ts'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'
import { FolderPicker } from './folder-picker.tsx'

function canRemoveUpload(file: DatasetPiece) {
  const upload = file.upload
  return Boolean(
    upload &&
      (upload.phase === 'failed' || upload.phase === 'interrupted') &&
      !file.copyCount &&
      !file.datasetId &&
      !file.datasetIds?.length &&
      upload.providers.every((provider) => !provider.confirmed && (!provider.transactionHash || provider.rejected))
  )
}

export function FileUploadDetails({ file }: { file: DatasetPiece }) {
  const tasks = useUploadTasks()
  const { mutateHistory, hasUnsavedChanges } = useUploadHistory()
  const upload = file.upload
  const picker = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  if (!upload) return null
  const active = tasks?.activeIds.has(file.id)
  const retryable = upload.phase === 'failed' || (upload.phase === 'interrupted' && !file.pieceCid)
  const status = fileStatus(file)
  const progress = copyProgress(file)
  const removable = canRemoveUpload(file) && !active
  const queued = Boolean(tasks?.queuedIds.has(file.id))
  const canCheck = !active && upload.phase !== 'complete' && !retryable
  const canRetry = retryable && !active
  return (
    <section className="space-y-2 rounded-lg border border-border bg-canvas/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Upload status</h3>
        <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${fileStatusColors(status)}`} role="status">
          {status}
        </span>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted">
          {file.copyCount ?? 0} of {upload.expectedCopies} copies confirmed
        </p>
        {progress && (
          <p className="text-xs text-muted">
            {progress === 'Confirming'
              ? 'Confirming remaining copies.'
              : progress === 'Interrupted'
                ? 'Upload interrupted before all copies were confirmed.'
                : progress === 'Partial' || progress === 'Failed'
                  ? 'Fewer copies stored than requested.'
                  : 'Uploading remaining copies.'}
          </p>
        )}
      </div>
      {(queued || canCheck || hasUnsavedChanges || canRetry || removable) && (
        <div className="flex flex-wrap gap-2">
          {queued && (
            <Button
              className="w-auto px-3 py-1.5 text-xs"
              onClick={() => void tasks?.cancelQueued(file.id)}
              size="sm"
              variant="secondary"
            >
              Cancel queued upload
            </Button>
          )}
          {canCheck && (
            <Button
              className="w-auto px-3 py-1.5 text-xs sm:min-h-8"
              disabled={tasks?.checking.has(file.id) || !tasks}
              onClick={() => void tasks?.check(file.id)}
              size="sm"
              variant="secondary"
            >
              {tasks?.checking.has(file.id) ? 'Checking…' : 'Check status'}
            </Button>
          )}
          {hasUnsavedChanges && (
            <Button
              className="w-auto px-3 py-1.5 text-xs sm:min-h-8"
              onClick={() => void mutateHistory((current) => current).catch((cause) => setError(String(cause)))}
              size="sm"
              variant="secondary"
            >
              Retry saving
            </Button>
          )}
          {canRetry &&
            (file.isDirectory ? (
              <details className="w-full text-xs">
                <summary className="w-fit cursor-pointer text-link">Retry folder upload</summary>
                <div className="mt-3">
                  <FolderPicker
                    disabled={!tasks}
                    onUpload={(source) => {
                      void tasks?.start(source, file.folderPath ?? '', file.id)
                    }}
                  />
                </div>
              </details>
            ) : (
              <>
                <Button
                  className="w-auto px-3 py-1.5 text-xs sm:min-h-8"
                  disabled={!tasks}
                  onClick={() => picker.current?.click()}
                  size="sm"
                >
                  Retry upload
                </Button>
                <input
                  aria-label="Select original file to retry"
                  className="hidden"
                  onChange={(event) => {
                    const selected = event.target.files?.[0]
                    if (selected) void tasks?.start(selected, file.folderPath ?? '', file.id)
                    event.target.value = ''
                  }}
                  ref={picker}
                  type="file"
                />
              </>
            ))}
          {removable && (
            <Button
              className="w-auto px-3 py-1.5 text-xs sm:min-h-8"
              disabled={tasks?.checking.has(file.id)}
              onClick={() =>
                void mutateHistory((current) => {
                  const latest = current.find((record) => record.id === file.id)
                  if (latest && !canRemoveUpload(latest))
                    throw new Error('Storage status changed. Check the latest result before removing this record.')
                  return current.filter((record) => record.id !== file.id)
                }).catch((cause) => setError(String(cause)))
              }
              size="sm"
              variant="secondary"
            >
              Remove from list
            </Button>
          )}
        </div>
      )}
      {removable && <p className="text-xs text-muted">Removes this local record only.</p>}
      {error && (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted hover:text-foreground">Upload details</summary>
        <p className="mt-3 text-xs text-muted">
          File transfer · {file.pieceCid ? 'Received by provider' : 'Receipt not recorded'}
        </p>
        <p className="mt-2 text-xs text-muted">
          IPFS indexing ·{' '}
          {file.ipfsIndexed === true ? 'Indexed' : file.ipfsIndexed === false ? 'Not confirmed' : 'Unknown'}
        </p>
        {upload.error && <p className="mt-3 break-words text-xs text-warning">{upload.error}</p>}
        {!active && file.pieceCid && upload.phase !== 'complete' && (
          <p className="mt-3 text-xs text-muted">
            Files received but not confirmed may be removed by the provider. Check status before uploading the same
            content again. Removing a local record does not cancel transactions; confirmed files can reappear from the
            Filecoin index.
          </p>
        )}
        <h4 className="mt-4 text-xs font-medium">Provider receipts</h4>
        <ul aria-label="Provider receipts" className="mt-3 space-y-2 text-xs text-muted">
          {upload.providers.map((provider) => (
            <li className="space-y-1" key={provider.providerId}>
              <p>
                Provider {provider.providerId} ·{' '}
                {provider.confirmed
                  ? 'Storage confirmed'
                  : provider.rejected
                    ? 'Submission rejected'
                    : provider.transactionHash
                      ? 'Submission receipt recorded'
                      : provider.stored
                        ? 'File received; submission receipt not recorded'
                        : 'Receipt not recorded'}
              </p>
              {provider.transactionHash && (
                <a
                  className="text-link underline"
                  href={getTxExplorerLink(provider.transactionHash, file.network)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View transaction
                </a>
              )}
            </li>
          ))}
        </ul>
        <h4 className="mt-4 text-xs font-medium">{active ? 'Upload steps' : 'Last saved progress'}</h4>
        <ol className="mt-3 space-y-3">
          {upload.steps.map((step) => (
            <li className="flex items-center justify-between gap-3" key={step.step}>
              <span>{getStepLabel(step.step)}</span>
              <span className="text-xs text-muted">
                {step.status === 'completed'
                  ? 'Complete'
                  : active
                    ? step.status === 'error'
                      ? 'Needs attention'
                      : step.status === 'in-progress'
                        ? 'In progress'
                        : 'Waiting'
                    : 'Not verified'}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}
