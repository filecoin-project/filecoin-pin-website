import { useMemo } from 'react'
import type { StepState } from '../types/upload/step.ts'
import { getFirstStageProgress, getFirstStageStatus } from '../utils/upload/upload-progress.ts'

type FirstStageStateProps = {
  progress: StepState['progress']
  status: StepState['status']
}

/**
 * Hook that calculates the combined progress and status for the first stage.
 * Aggregates creating-car, checking-readiness, and uploading-car steps.
 */

export function useFirstStageState(stepStates: StepState[]): FirstStageStateProps {
  return useMemo(() => {
    const progress = getFirstStageProgress(stepStates)
    const status = getFirstStageStatus(stepStates)

    return { progress, status }
  }, [stepStates])
}
