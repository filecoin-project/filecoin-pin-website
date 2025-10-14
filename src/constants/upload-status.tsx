import type { StepType } from '../types/upload-progress.ts'

export const COMBINED_STEPS: StepType[] = ['creating-car', 'checking-readiness', 'uploading-car'] as const

export const INDIVIDUAL_STEPS: StepType[] = ['announcing-cids', 'finalizing-transaction'] as const

export const STEP_LABELS: Record<StepType, string> = {
  'creating-car': 'Creating CAR and uploading to the Filecoin SP',
  'checking-readiness': 'Creating CAR and uploading to the Filecoin SP',
  'uploading-car': 'Creating CAR and uploading to the Filecoin SP',
  'announcing-cids': 'Announcing IPFS CIDs to IPNI',
  'finalizing-transaction': 'Finalizing storage transaction on Calibration testnet',
}

export const STEP_ESTIMATES: Record<StepType, string> = {
  'creating-car': 'Estimated time: ~30 seconds',
  'checking-readiness': 'Estimated time: ~30 seconds',
  'uploading-car': 'Estimated time: ~30 seconds',
  'announcing-cids': 'Estimated time: ~30 seconds',
  'finalizing-transaction': 'Estimated time: ~30-60 seconds',
}
