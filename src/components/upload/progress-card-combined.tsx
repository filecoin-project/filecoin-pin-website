import type { Progress } from '../../types/upload-progress.ts'
import { getEstimatedTime, getStepLabel } from '../../utils/upload-status.ts'
import { Card } from '../ui/card.tsx'
import { ProgressBar } from '../ui/progress-bar.tsx'

interface ProgressCardCombinedProps {
  progress: Progress[]
  getCombinedFirstStageStatus: () => Progress['status']
  getCombinedFirstStageProgress: () => number
}

function ProgressCardCombined({
  progress,
  getCombinedFirstStageStatus,
  getCombinedFirstStageProgress,
}: ProgressCardCombinedProps) {
  const hasCreatingCarStep = progress.find((p) => p.step === 'creating-car')

  if (!hasCreatingCarStep) return null

  return (
    <Card.Wrapper>
      <Card.Header
        estimatedTime={getEstimatedTime('creating-car')}
        status={getCombinedFirstStageStatus()}
        title={getStepLabel('creating-car')}
      />
      {getCombinedFirstStageStatus() === 'in-progress' && <ProgressBar progress={getCombinedFirstStageProgress()} />}
    </Card.Wrapper>
  )
}

export { ProgressCardCombined }
