import type { Progress } from '../../types/upload-progress.ts'
import { getEstimatedTime, getStepLabel } from '../../utils/upload-status.ts'
import { Card } from '../ui/card.tsx'
import { ProgressBar } from '../ui/progress-bar.tsx'

interface ProgressCardCombinedProps {
  progresses: Array<Progress>
  getCombinedFirstStageStatus: () => Progress['status']
  getCombinedFirstStageProgress: () => number
}

function ProgressCardCombined({
  progresses,
  getCombinedFirstStageStatus,
  getCombinedFirstStageProgress,
}: ProgressCardCombinedProps) {
  const hasCreatingCarStep = progresses.find((progress) => progress.step === 'creating-car')

  const firstStagestatus = getCombinedFirstStageStatus()
  const firstStageProgress = getCombinedFirstStageProgress()

  if (!hasCreatingCarStep) return null

  return (
    <Card.Wrapper>
      <Card.Header
        estimatedTime={getEstimatedTime('creating-car')}
        status={firstStagestatus}
        title={getStepLabel('creating-car')}
      />
      {firstStagestatus === 'in-progress' && <ProgressBar progress={firstStageProgress} />}
    </Card.Wrapper>
  )
}

export { ProgressCardCombined }
