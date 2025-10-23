export type StepName =
  | 'creating-car'
  | 'checking-readiness'
  | 'uploading-car'
  | 'announcing-cids'
  | 'finalizing-transaction'

export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'error'

export interface StepState {
  step: StepName
  progress: number // 0–100
  status: StepStatus
  error?: string
}

export type StepType = StepState['step']
