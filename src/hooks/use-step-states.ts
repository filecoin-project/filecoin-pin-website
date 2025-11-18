import { useMemo } from 'react'
import type { StepState } from '../types/upload/step.ts'

/**
 * Hook that extracts and organizes specific step states from the full array.
 * Provides easy access to individual steps and stage groupings.
 */
export function useStepStates(stepStates: StepState[]) {
  return useMemo(() => {
    const creatingCarStep = stepStates.find((s) => s.step === 'creating-car')
    const uploadingCarStep = stepStates.find((s) => s.step === 'uploading-car')
    const checkingReadinessStep = stepStates.find((s) => s.step === 'checking-readiness')
    const announcingCidsStep = stepStates.find((s) => s.step === 'announcing-cids')
    const finalizingStep = stepStates.find((s) => s.step === 'finalizing-transaction')

    return {
      creatingCarStep,
      uploadingCarStep,
      checkingReadinessStep,
      announcingCidsStep,
      finalizingStep,
    }
  }, [stepStates])
}
