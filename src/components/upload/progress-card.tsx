import type { StepState } from '../../types/upload/step.ts'
import { getStepEstimatedTime, getStepLabel } from '../../utils/upload/step-utils.ts'
import { Alert } from '../ui/alert.tsx'
import { Card } from '../ui/card.tsx'
import { TextWithCopyToClipboard } from '../ui/text-with-copy-to-clipboard.tsx'

interface ProgressCardProps {
  stepState: StepState
  transactionHash?: string
}

function ProgressCard({ stepState, transactionHash }: ProgressCardProps) {
  return (
    <Card.Wrapper>
      <Card.Header
        estimatedTime={getStepEstimatedTime(stepState.step)}
        status={stepState.status}
        title={getStepLabel(stepState.step)}
        withSpinner
      />

      {stepState.error && (
        <Alert message={stepState.error} variant={stepState.step === 'announcing-cids' ? 'warning' : 'error'} />
      )}

      {stepState.step === 'finalizing-transaction' && transactionHash && (
        <Card.Content>
          <TextWithCopyToClipboard
            href={`https://filecoin-testnet.blockscout.com/tx/${transactionHash}`}
            prefix="tx:"
            text={transactionHash}
          />
        </Card.Content>
      )}
    </Card.Wrapper>
  )
}

export { ProgressCard }
