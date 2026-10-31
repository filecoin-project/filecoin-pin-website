import type { StepName } from '../../types/upload/step.ts'

const STEP_LABELS: Record<StepName, { short: string; detail: string }> = {
  'creating-car': { short: 'Preparing IPFS data', detail: 'Preparing IPFS data' },
  'checking-readiness': { short: 'Checking storage setup', detail: 'Checking storage setup' },
  'uploading-car': { short: 'Uploading to Filecoin', detail: 'Uploading to Filecoin storage provider' },
  replicating: { short: 'Replicating storage copies', detail: 'Replicating across storage providers' },
  'announcing-cids': { short: 'IPFS indexing', detail: 'Announcing IPFS CIDs to IPNI' },
  'finalizing-transaction': { short: 'Storage provider confirmation', detail: 'Storage provider confirmation' },
}

export function getStepLabel(step: StepName, variant: 'short' | 'detail' = 'detail') {
  return STEP_LABELS[step][variant]
}

export function getStepEstimatedTime(step: StepName) {
  switch (step) {
    case 'replicating':
      return 'Estimated time: ~10-60 seconds'
    case 'announcing-cids':
      return 'Estimated time: ~30 seconds'
  }
}
