import type { Progress } from '@/types/upload-progress.ts'
import { getEstimatedTime, getStepLabel } from '../../utils/upload-status.ts'
import { Alert } from '../ui/alert.tsx'
import { Card } from '../ui/card.tsx'
import { TextWithCopyToClipboard } from '../ui/text-with-copy-to-clipboard.tsx'

interface ProgressCardProps {
  step: Progress
  transactionHash?: string
}

function ProgressCard({ step, transactionHash }: ProgressCardProps) {
  return (
    <Card.Wrapper>
      <Card.Header
        estimatedTime={getEstimatedTime(step.step)}
        status={step.status}
        title={getStepLabel(step.step)}
        withSpinner
      />

      {step.error && <Alert message={step.error} variant="error" />}

      {step.step === 'finalizing-transaction' && transactionHash && (
        <Card.Content>
          <TextWithCopyToClipboard
            href={`https://filecoin-testnet.blockscout.com/tx/${transactionHash}`}
            text={transactionHash}
          />
        </Card.Content>
      )}
    </Card.Wrapper>
  )
}

export { ProgressCard }
