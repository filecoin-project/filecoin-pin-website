import { useFirstStageState } from '@/hooks/use-first-stage-state.ts'
import { useStepStates } from '@/hooks/use-step-states.ts'
import type { StepState } from '../../types/upload/step.ts'
import { getStepEstimatedTime, getStepLabel } from '../../utils/upload/step.ts'
import { Card } from '../ui/card.tsx'
import { ProgressBar } from '../ui/progress-bar.tsx'

interface ProgressCardCombinedProps {
  stepStates: Array<StepState>
}

function ProgressCardCombined({ stepStates }: ProgressCardCombinedProps) {
  const { creatingCarStep } = useStepStates(stepStates)
  const { progress, status } = useFirstStageState(stepStates)

  if (!creatingCarStep) return null

  return (
    <Card.Wrapper>
      <Card.Header
        estimatedTime={getStepEstimatedTime('creating-car')}
        status={status}
        title={getStepLabel('creating-car')}
      />
      {status === 'in-progress' && <ProgressBar progress={progress} />}
    </Card.Wrapper>
  )
}

export { ProgressCardCombined }
