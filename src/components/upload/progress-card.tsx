import type { StepState } from '../../types/upload/step.ts'
import { getStepEstimatedTime, getStepLabel } from '../../utils/upload/step-utils.ts'
import { Alert } from '../ui/alert.tsx'
import { Card } from '../ui/card.tsx'
import { TextWithCopyToClipboard } from '../ui/text-with-copy-to-clipboard.tsx'

interface ProgressCardProps {
  stepState: StepState
  transactionHash?: string
  transactionHashes?: string[]
  confirmedCount?: number
  expectedCopyCount?: number
}

function ProgressCard({
  stepState,
  transactionHash,
  transactionHashes,
  confirmedCount,
  expectedCopyCount,
}: ProgressCardProps) {
  const isFinalizing = stepState.step === 'finalizing-transaction'
  const hashes =
    transactionHashes && transactionHashes.length > 0 ? transactionHashes : transactionHash ? [transactionHash] : []
  const showProgress = isFinalizing && expectedCopyCount != null && expectedCopyCount > 1

  return (
    <Card.Wrapper>
      <Card.Header
        estimatedTime={
          showProgress && stepState.status === 'in-progress'
            ? `${confirmedCount ?? 0} of ${expectedCopyCount} transactions confirmed`
            : getStepEstimatedTime(stepState.step)
        }
        status={stepState.status}
        title={showProgress ? 'Finalizing storage transactions on Calibration testnet' : getStepLabel(stepState.step)}
        withSpinner
      />

      {stepState.error && (
        <Alert message={stepState.error} variant={stepState.step === 'announcing-cids' ? 'warning' : 'error'} />
      )}

      {isFinalizing && hashes.length > 0 && (
        <Card.Content>
          <div className="space-y-1">
            {hashes.map((hash) => (
              <TextWithCopyToClipboard
                href={`https://filecoin-testnet.blockscout.com/tx/${hash}`}
                key={hash}
                prefix="tx:"
                text={hash}
              />
            ))}
          </div>
        </Card.Content>
      )}
    </Card.Wrapper>
  )
}

export { ProgressCard }
