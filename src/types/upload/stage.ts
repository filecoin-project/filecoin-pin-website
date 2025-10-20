import type { StepState } from '../upload/step.ts'

export type StageId = 'first-stage' | 'second-stage' | 'third-stage'

export const STAGE_STEPS: Record<StageId, readonly StepState['step'][]> = {
  'first-stage': ['creating-car', 'checking-readiness', 'uploading-car'],
  'second-stage': ['announcing-cids'],
  'third-stage': ['finalizing-transaction'],
} as const

export type FirstStageGroup = Record<
  'creatingCar' | 'checkingReadiness' | 'uploadingCar',
  { progress: number; status: StepState['status'] }
>
