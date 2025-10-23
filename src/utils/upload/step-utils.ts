import type { StepState } from '../../types/upload/step.ts'

export function getStepLabel(step: StepState['step']) {
  switch (step) {
    case 'creating-car':
    case 'checking-readiness':
    case 'uploading-car':
      return 'Preparing service, creating CAR file, and uploading to the Filecoin SP'
    case 'announcing-cids':
      return 'Announcing IPFS CIDs to IPNI'
    case 'finalizing-transaction':
      return 'Finalizing storage transaction on Calibration testnet'
  }
}

export function getStepEstimatedTime(step: StepState['step']) {
  switch (step) {
    case 'creating-car':
    case 'checking-readiness':
    case 'uploading-car':
      return 'Estimated time: ~30 seconds'
    case 'announcing-cids':
      return 'Estimated time: ~30 seconds'
    case 'finalizing-transaction':
      return 'Estimated time: ~30-60 seconds'
  }
}

export function stepHasActiveStatus(status?: StepState['status']) {
  return status === 'completed' || status === 'in-progress'
}
