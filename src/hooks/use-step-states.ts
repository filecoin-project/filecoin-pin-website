import { useMemo } from 'react'
import { STAGE_STEPS } from '../types/upload/stage.ts'
import type { StepState } from '../types/upload/step.ts'


/**
 * Hook that extracts and organizes specific step states from the full array.
 * Provides easy access to individual steps and stage groupings.
 */
export function useStepStates(stepStates: StepState[]) {
  return useMemo(() => {
    const creatingCarStep = stepStates.find((s) => s.step === 'creating-car')
    const uploadingCarStep = stepStates.find((s) => s.step === 'uploading-car')
    const announcingCidsStep = stepStates.find((s) => s.step === 'announcing-cids')
    const finalizingStep = stepStates.find((s) => s.step === 'finalizing-transaction')
    const firstStageStates = stepStates.filter(
      (stepState) => STAGE_STEPS.firstStage.find((step) => step === stepState.step) !== undefined
    )

    return {
      creatingCarStep,
      uploadingCarStep,
      announcingCidsStep,
      finalizingStep,
      firstStageStates,
    }
  }, [stepStates])
}
