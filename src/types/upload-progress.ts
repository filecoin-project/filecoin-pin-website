export interface Progress {
  step: 'creating-car' | 'uploading-car' | 'checking-readiness' | 'announcing-cids' | 'finalizing-transaction'
  progress: number // 0-100
  status: 'pending' | 'in-progress' | 'completed' | 'error'
  error?: string
}

export type StepType = Progress['step']
