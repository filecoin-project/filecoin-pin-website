import type { StepState } from '../../types/upload/step.ts'

type getUploadOutcomeProps = {
  stepStates: StepState[]
  cid?: string
}

export function getUploadOutcome({ stepStates, cid }: getUploadOutcomeProps) {
  const hasIpniAnnounceFailure =
    stepStates.find((stepState) => stepState.step === 'announcing-cids')?.status === 'error'

  const isUploadFailure = stepStates.some(
    (stepState) => stepState.status === 'error' && stepState.step !== 'announcing-cids'
  )

  const isUploadSuccessful =
    Boolean(cid) &&
    stepStates.every((stepState) => {
      return stepState.status === 'completed' || (stepState.step === 'announcing-cids' && stepState.status === 'error')
    })

  return { hasIpniAnnounceFailure, isUploadSuccessful, isUploadFailure }
}

type getUploadBadgeStatusProps = {
  isUploadSuccessful: boolean
  isUploadFailure: boolean
  stepStates: StepState[]
  finalizingStep?: StepState
  announcingCidsStep?: StepState
}

export function getUploadBadgeStatus({
  isUploadSuccessful,
  isUploadFailure,
  stepStates,
  finalizingStep,
  announcingCidsStep,
}: getUploadBadgeStatusProps) {
  const hasInProgressSteps = stepStates.some((stepState) => stepState.status === 'in-progress')
  const hasPendingSteps = stepStates.some((s) => s.status === 'pending')
  const hasCompletedSteps = stepStates.some((s) => s.status === 'completed')

  if (isUploadSuccessful) return 'pinned'
  if (isUploadFailure) return 'error'

  if (finalizingStep?.status === 'completed' && announcingCidsStep?.status !== 'completed') {
    return 'published'
  }

  if (hasInProgressSteps) return 'in-progress'
  if (hasCompletedSteps && hasPendingSteps) return 'in-progress'

  return 'pending'
}
