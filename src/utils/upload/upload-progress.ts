import type { FirstStageGroup } from '../../types/upload/stage.ts'
import type { StepState } from '../../types/upload/step.ts'
import { stepHasActiveStatus } from './step-utils.ts'

export const firstStageGroup: FirstStageGroup = {
  creatingCar: { progress: 0, status: 'pending' },
  checkingReadiness: { progress: 0, status: 'pending' },
  uploadingCar: { progress: 0, status: 'pending' },
}

function getFirstStageState(stepStates: StepState[]) {
  const stepMap: Record<string, keyof typeof firstStageGroup> = {
    'creating-car': 'creatingCar',
    'checking-readiness': 'checkingReadiness',
    'uploading-car': 'uploadingCar',
  }

  return stepStates.reduce<typeof firstStageGroup>(
    (acc, stepState) => {
      const key = stepMap[stepState.step]
      if (key) {
        acc[key] = { progress: stepState.progress, status: stepState.status }
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

export function getFirstStageStatus(stepStates: StepState[]) {
  const firstStageState = getFirstStageState(stepStates)

  const { creatingCar, checkingReadiness, uploadingCar } = firstStageState

  if (uploadingCar?.status === 'error' || checkingReadiness?.status === 'error' || creatingCar?.status === 'error') {
    return 'error'
  }

  if (uploadingCar?.status === 'completed') return 'completed'

  if (Object.values(firstStageState).some((s) => stepHasActiveStatus(s.status))) return 'in-progress'

  return 'pending'
}
