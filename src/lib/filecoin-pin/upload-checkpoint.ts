import type { StepState } from '../../types/upload/step.ts'
import type { UploadFailureCode } from '../../utils/upload/upload-readiness.ts'

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
  phase: 'funding' | 'waiting' | 'uploading' | 'confirming' | 'pending' | 'interrupted' | 'failed' | 'complete'
  expectedCopies: number
  providers: UploadProviderCheckpoint[]
  steps: StepState[]
  funding?: { depositNeeded: string; needsApproval: boolean }
  errorCode?: UploadFailureCode
  error?: string
  checks: number
  nextCheckAt: number
}
