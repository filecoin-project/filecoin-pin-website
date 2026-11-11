import { useRef, useState } from 'react'
import { useUploadHistory } from '../../context/upload-history-context.tsx'
import { useUploadTasks } from '../../context/upload-tasks-context.tsx'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { useUploadReadiness } from '../../hooks/use-upload-readiness.ts'
import { formatFundingAmount } from '../../lib/filecoin-pin/upload-funding.ts'
import { getTxExplorerLink } from '../../utils/links.ts'
import { canRemoveUpload } from '../../utils/upload/can-remove-upload.ts'
import { copyProgress, customerStatus, fileStatusColors } from '../../utils/upload/file-status.ts'
import { getStepLabel } from '../../utils/upload/step-utils.ts'
import {
  classifyUploadFailure,
  getRetryBlocker,
  type SetupTarget,
  uploadFailureMessage,
} from '../../utils/upload/upload-readiness.ts'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'
import { FolderPicker } from './folder-picker.tsx'

export function FileUploadDetails({
  file,
  onOpenWallet,
}: {
  file: DatasetPiece
  onOpenWallet: (target?: SetupTarget) => void
}) {
  const readiness = useUploadReadiness()
  const tasks = useUploadTasks()
  const { mutateHistory, hasUnsavedChanges } = useUploadHistory()
  const upload = file.upload
  const picker = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  if (!upload) return null
  const failureCode =
    upload.phase === 'funding'
      ? upload.funding && BigInt(upload.funding.depositNeeded) > 0n
        ? 'deposit'
        : 'approval'
      : (upload.errorCode ?? classifyUploadFailure(upload.error))
  const retryBlocker = getRetryBlocker(failureCode, readiness)
  const failureTarget =
    failureCode === 'unsupported_wallet' ? 'encryption' : failureCode === 'unknown' ? undefined : failureCode
  const active = tasks?.activeIds.has(file.id)
  const retryable =
    upload.phase === 'funding' || upload.phase === 'failed' || (upload.phase === 'interrupted' && !file.pieceCid)
  const status = customerStatus(file)
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
      {upload.error && (
        <div className="space-y-2" role="alert">
          <p className="break-words text-xs text-warning">{uploadFailureMessage(upload.error, failureCode)}</p>
          {failureTarget && (
            <button className="text-xs text-link underline" onClick={() => onOpenWallet(failureTarget)} type="button">
              Review Wallet setup
            </button>
          )}
        </div>
      )}
      {canRetry && retryBlocker && <p className="text-xs text-muted">Retry unavailable: {retryBlocker.message}</p>}
      {upload.phase === 'interrupted' && (file.copyCount ?? 0) > 0 && (
        <p className="text-xs text-muted">
          Your confirmed copies remain stored. Remaining upload work has stopped. Check status refreshes the file index
          and saved provider operations; it does not restart the upload.
        </p>
      )}
      {upload.phase === 'funding' && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4" role="status">
          <p className="text-sm font-medium">
            {upload.funding && BigInt(upload.funding.depositNeeded) > 0n
              ? `Add ${formatFundingAmount(BigInt(upload.funding.depositNeeded))} USDFC to continue.`
              : 'Approve storage payments to continue.'}
          </p>
          <p className="text-xs text-muted">
            {upload.funding?.needsApproval && BigInt(upload.funding.depositNeeded) > 0n
              ? 'Payment approval is also required. '
              : ''}
            Queued uploads are paused.
          </p>
          <button
            className="inline-flex items-center gap-1 text-xs font-medium text-link underline decoration-border underline-offset-4 hover:text-link-hover focus:brand-outline"
            onClick={() => onOpenWallet(failureTarget)}
            type="button"
          >
            {upload.funding && BigInt(upload.funding.depositNeeded) > 0n
              ? 'Add funds in Wallet and Storage'
              : 'Approve payments in Wallet and Storage'}
            <span aria-hidden="true">→</span>
          </button>
          {!tasks?.retainedIds.has(file.id) && (
            <p className="text-xs text-muted">
              Select the original file again after funding; file bytes are not retained after leaving this page.
            </p>
          )}
        </div>
      )}
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
            (upload.phase === 'funding' && tasks?.retainedIds.has(file.id) ? (
              <Button
                className="w-auto"
                disabled={Boolean(retryBlocker)}
                onClick={() => {
                  if (!retryBlocker) void tasks.resume(file.id)
                }}
                size="sm"
              >
                Check funding and continue
              </Button>
            ) : file.isDirectory ? (
              <details className="w-full text-xs">
                <summary className="w-fit cursor-pointer text-link">Retry folder upload</summary>
                <div className="mt-3">
                  <FolderPicker
                    disabled={!tasks || Boolean(retryBlocker)}
                    onUpload={(source) => {
                      if (!retryBlocker) void tasks?.start(source, file.folderPath ?? '', file.id)
                    }}
                  />
                </div>
              </details>
            ) : (
              <>
                <Button
                  className="w-auto px-3 py-1.5 text-xs sm:min-h-8"
                  disabled={!tasks || Boolean(retryBlocker)}
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
                    if (selected && !retryBlocker) void tasks?.start(selected, file.folderPath ?? '', file.id)
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
                void (
                  tasks?.retainedIds.has(file.id) && upload.phase === 'funding'
                    ? tasks.cancelQueued(file.id)
                    : mutateHistory((current) => {
                        const latest = current.find((record) => record.id === file.id)
                        if (latest && !canRemoveUpload(latest))
                          throw new Error(
                            'Storage status changed. Check the latest result before removing this record.'
                          )
                        return current.filter((record) => record.id !== file.id)
                      })
                ).catch((cause) => setError(String(cause)))
              }
              size="sm"
              variant="secondary"
            >
              Remove from list
            </Button>
          )}
        </div>
      )}
      {error && (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted hover:text-foreground">Upload details</summary>
        <p className="mt-3 text-xs text-muted">
          {file.copyCount ?? 0} of {upload.expectedCopies} copies confirmed
        </p>
        {progress && (
          <p className="mt-2 text-xs text-muted">
            {progress === 'Confirming'
              ? 'Confirming remaining copies.'
              : progress === 'Interrupted'
                ? 'Upload interrupted before all copies were confirmed.'
                : progress === 'Partial' || progress === 'Failed'
                  ? 'Fewer copies stored than requested.'
                  : 'Uploading remaining copies.'}
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          File transfer · {file.pieceCid ? 'Received by provider' : 'Receipt not recorded'}
        </p>
        <p className="mt-2 text-xs text-muted">
          IPFS indexing ·{' '}
          {file.ipfsIndexed === true ? 'Indexed' : file.ipfsIndexed === false ? 'Not confirmed' : 'Unknown'}
        </p>
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
              {provider.confirmed && !provider.transactionHash && <p>Transaction hash unavailable in this browser.</p>}
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
        {!active && (file.copyCount ?? 0) > 0 && upload.steps.some((step) => step.status !== 'completed') && (
          <p className="mt-2 text-xs text-muted">
            These steps show the last saved browser progress. Current storage confirmations are shown above and in
            Storage copies; unverified steps do not undo a confirmed copy.
          </p>
        )}
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
