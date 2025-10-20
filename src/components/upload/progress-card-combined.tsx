import type { StepState } from '../../types/upload/step.ts'
import { getStepEstimatedTime, getStepLabel } from '../../utils/upload/step.ts'
import { Card } from '../ui/card.tsx'
import { ProgressBar } from '../ui/progress-bar.tsx'

interface ProgressCardCombinedProps {
  stepStates: Array<StepState>
  firstStageStatus: StepState['status']
  firstStageProgress: StepState['progress']
}

function ProgressCardCombined({ stepStates, firstStageStatus, firstStageProgress }: ProgressCardCombinedProps) {
  const hasCreatingCarStep = stepStates.find((stepState) => stepState.step === 'creating-car')

  if (!hasCreatingCarStep) return null

  return (
    <Card.Wrapper>
      <Card.Header
        estimatedTime={getStepEstimatedTime('creating-car')}
        status={firstStageStatus}
        title={getStepLabel('creating-car')}
      />
      {firstStageStatus === 'in-progress' && <ProgressBar progress={firstStageProgress} />}
    </Card.Wrapper>
  )
}

export { ProgressCardCombined }
