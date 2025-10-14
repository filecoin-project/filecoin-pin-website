import type { Progress } from '@/types/upload-progress.ts'

type FirstSteoGroupRecord = Record<
  'creatingCar' | 'checkingReadiness' | 'uploadingCar',
  { progress: number; status: Progress['status'] }
>

// simple type to help with searching for UploadProgress['step'] in the first step group
export const firstStepGroup: FirstSteoGroupRecord = {
  creatingCar: { progress: 0, status: 'pending' },
  checkingReadiness: { progress: 0, status: 'pending' },
  uploadingCar: { progress: 0, status: 'pending' },
}

export function createStepGroup(progress: Progress[]) {
  // Map kebab-case step names to camelCase keys
  const stepMap: Record<string, keyof typeof firstStepGroup> = {
    'creating-car': 'creatingCar',
    'checking-readiness': 'checkingReadiness',
    'uploading-car': 'uploadingCar',
  }

  return progress.reduce<typeof firstStepGroup>(
    (acc, p) => {
      const key = stepMap[p.step]
      if (key) {
        acc[key] = { progress: p.progress, status: p.status }
      }
      return acc
    },
    {
      creatingCar: { progress: 0, status: 'pending' },
      checkingReadiness: { progress: 0, status: 'pending' },
      uploadingCar: { progress: 0, status: 'pending' },
    }
  )
}

export function getStepLabel(step: Progress['step']) {
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

export function getEstimatedTime(step: Progress['step']) {
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
