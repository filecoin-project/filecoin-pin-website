import { useMemo } from 'react'
import type { StepState } from '../types/upload/step.ts'
import { getFirstStageProgress, getFirstStageStatus } from '../utils/upload/stage.ts'

type FirstStageStateProps = {
  progress: StepState['progress']
  status: StepState['status']
}

export function useFirstStageState(stepStates: StepState[]): FirstStageStateProps {
  return useMemo(() => {
    const progress = getFirstStageProgress(stepStates)
    const status = getFirstStageStatus(stepStates)

    return { progress, status }
  }, [stepStates])
}
