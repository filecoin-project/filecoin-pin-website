import type { StepState } from '../upload/step.ts'

export type StageId = 'firstStage' | 'secondStage' | 'thirdStage'

export const STAGE_STEPS: Record<StageId, readonly StepState['step'][]> = {
  firstStage: ['creating-car', 'checking-readiness', 'uploading-car'],
  secondStage: ['announcing-cids'],
  thirdStage: ['finalizing-transaction'],
} as const satisfies Record<StageId, readonly StepState['step'][]>

export type FirstStageGroup = Record<
  'creatingCar' | 'checkingReadiness' | 'uploadingCar',
  { progress: number; status: StepState['status'] }
>
