import { getNetworkLabel } from '../../lib/filecoin-pin/network.ts'
import type { StepState } from '../../types/upload/step.ts'
import { getTxExplorerLink } from '../../utils/links.ts'
import { getStepEstimatedTime, getStepLabel } from '../../utils/upload/step-utils.ts'
import { Alert } from '../ui/alert.tsx'
import { Card } from '../ui/card.tsx'
import { TextWithCopyToClipboard } from '../ui/text-with-copy-to-clipboard.tsx'

interface ProgressCardProps {
  stepState: StepState
  transactionHash?: string
  transactionHashes?: string[]
  confirmedCopies?: number
  expectedCopies?: number
  network?: string
}

function ProgressCard({
  stepState,
  transactionHash,
  transactionHashes,
  confirmedCopies,
  expectedCopies,
  network,
}: ProgressCardProps) {
  const isFinalizing = stepState.step === 'finalizing-transaction'
  const hashes =
    transactionHashes && transactionHashes.length > 0 ? transactionHashes : transactionHash ? [transactionHash] : []
  const showProgress = isFinalizing && expectedCopies != null && expectedCopies > 1

  return (
    <Card.Wrapper>
      <Card.Header
        estimatedTime={
          showProgress && stepState.status === 'in-progress'
            ? `${confirmedCopies ?? 0} of ${expectedCopies} transactions confirmed`
            : getStepEstimatedTime(stepState.step)
        }
        status={stepState.status}
        title={
          showProgress ? `Finalizing storage transactions on ${getNetworkLabel(network)}` : getStepLabel(stepState.step)
        }
        withSpinner
      />

      {stepState.error && (
        <Alert message={stepState.error} variant={stepState.step === 'announcing-cids' ? 'warning' : 'error'} />
      )}

      {isFinalizing && hashes.length > 0 && (
        <Card.Content>
          <div className="space-y-1">
            {hashes.map((hash) => (
              <TextWithCopyToClipboard href={getTxExplorerLink(hash, network)} key={hash} prefix="tx:" text={hash} />
            ))}
          </div>
        </Card.Content>
      )}
    </Card.Wrapper>
  )
}

export { ProgressCard }
