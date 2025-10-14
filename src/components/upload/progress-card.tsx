import type { Progress } from '@/types/upload-progress.ts'
import { getEstimatedTime, getStepLabel } from '../../utils/upload-status.ts'
import { Alert } from '../ui/alert.tsx'
import { Card } from '../ui/card.tsx'
import { TextWithCopyToClipboard } from '../ui/text-with-copy-to-clipboard.tsx'

interface ProgressCardProps {
  progress: Progress
  transactionHash?: string
}

function ProgressCard({ progress, transactionHash }: ProgressCardProps) {
  return (
    <Card.Wrapper>
      <Card.Header
        estimatedTime={getEstimatedTime(progress.step)}
        status={progress.status}
        title={getStepLabel(progress.step)}
        withSpinner
      />

      {progress.error && (
        <Alert message={progress.error} variant={progress.step === 'announcing-cids' ? 'warning' : 'error'} />
      )}

      {progress.step === 'finalizing-transaction' && transactionHash && (
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
