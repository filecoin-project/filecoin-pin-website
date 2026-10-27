import { Check, Circle, CircleAlert, Loader2 } from 'lucide-react'
import type { StepName, StepState } from '../../types/upload/step.ts'
import { getIpfsGatewayRenderLink, getTxExplorerLink } from '../../utils/links.ts'
import { getStepEstimatedTime } from '../../utils/upload/step-utils.ts'
import { TextWithCopyToClipboard } from '../ui/text-with-copy-to-clipboard.tsx'
import type { UploadStatusProps } from './upload-status.tsx'

interface UploadProgressProps {
  stepStates: Array<StepState>
  transactionHash?: UploadStatusProps['transactionHash']
  transactionHashes?: string[]
  confirmedCopies?: number
  expectedCopies?: number
  cid?: string
  network?: string
}

const stepLabels: Record<StepName, string> = {
  'creating-car': 'Preparing IPFS data',
  'checking-readiness': 'Checking storage setup',
  'uploading-car': 'Uploading to Filecoin',
  replicating: 'Replicating storage copies',
  'announcing-cids': 'IPFS indexing',
  'finalizing-transaction': 'Storage provider confirmation',
}

function UploadProgress({
  stepStates,
  transactionHash,
  transactionHashes,
  confirmedCopies,
  expectedCopies,
  cid,
  network,
}: UploadProgressProps) {
  const hashes = [...new Set(transactionHashes?.length ? transactionHashes : transactionHash ? [transactionHash] : [])]
  return (
    <div className="space-y-5">
      <ol aria-label="Upload stages">
        {stepStates.map((step, index) => {
          const active = step.status === 'in-progress'
          const complete = step.status === 'completed'
          const failed = step.status === 'error'
          const warning = failed && (step.step === 'announcing-cids' || step.step === 'replicating')
          const tone = failed ? (warning ? 'text-warning' : 'text-danger') : active ? 'text-accent' : 'text-muted'
          const Icon = complete ? Check : active ? Loader2 : failed ? CircleAlert : Circle
          return (
            <li className="relative flex gap-3 pb-5 last:pb-0" key={step.step}>
              {index < stepStates.length - 1 && (
                <span aria-hidden="true" className="absolute bottom-0 left-[11px] top-7 w-px bg-border" />
              )}
              <span
                className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${complete ? 'bg-success-surface text-success' : active ? 'bg-brand-800/10 text-accent' : tone}`}
              >
                <Icon aria-hidden="true" className={active ? 'animate-spin' : ''} size={15} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-sm leading-5 ${active || failed ? 'font-medium text-foreground' : 'text-muted'}`}>
                    {stepLabels[step.step]}
                  </p>
                  <span className={`shrink-0 text-[11px] leading-5 ${tone}`}>
                    {complete
                      ? 'Complete'
                      : active
                        ? 'In progress'
                        : warning
                          ? step.step === 'replicating'
                            ? 'Reduced copies'
                            : 'Unconfirmed'
                          : failed
                            ? 'Failed'
                            : 'Waiting'}
                  </span>
                </div>
                {active && getStepEstimatedTime(step.step) && (
                  <p className="mt-1 text-xs text-muted">{getStepEstimatedTime(step.step)}</p>
                )}
                {step.step === 'finalizing-transaction' && (expectedCopies ?? 0) > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    {confirmedCopies ?? 0} of {expectedCopies} provider confirmations received
                  </p>
                )}
                {active && step.step === 'finalizing-transaction' && (
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Waiting for storage providers to report completion. Transactions may already be confirmed on-chain.
                  </p>
                )}
                {step.error && <p className={`mt-1 text-xs leading-5 break-words ${tone}`}>{step.error}</p>}
              </div>
            </li>
          )
        })}
      </ol>
      {(cid || hashes.length > 0) && (
        <details className="border-t border-border pt-4 text-xs text-muted">
          <summary className="w-fit cursor-pointer hover:text-foreground">Content and transaction details</summary>
          <div className="mt-3 min-w-0 space-y-3">
            {cid && (
              <div className="space-y-1">
                <p>IPFS root CID</p>
                <TextWithCopyToClipboard href={getIpfsGatewayRenderLink(cid)} text={cid} />
              </div>
            )}
            {hashes.map((hash, index) => (
              <div className="space-y-1" key={hash}>
                <p>Copy {index + 1} · On-chain transaction</p>
                <TextWithCopyToClipboard href={getTxExplorerLink(hash, network)} text={hash} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

export { UploadProgress }
