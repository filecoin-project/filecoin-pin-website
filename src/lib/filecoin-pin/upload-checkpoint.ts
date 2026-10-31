import type { StepState } from '../../types/upload/step.ts'

export interface UploadProviderCheckpoint {
  providerId: string
  serviceURL: string
  dataSetId?: string
  transactionHash?: string
  stored?: boolean
  confirmed?: boolean
  rejected?: boolean
  pieceId?: string
}

/** JSON-only recovery data. File bytes and SDK objects are never persisted. */
export interface UploadCheckpoint {
  phase: 'waiting' | 'uploading' | 'confirming' | 'pending' | 'interrupted' | 'failed' | 'complete'
  expectedCopies: number
  providers: UploadProviderCheckpoint[]
  steps: StepState[]
  error?: string
  checks: number
  nextCheckAt: number
}
