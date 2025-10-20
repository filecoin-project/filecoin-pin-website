import type { StepState } from '../../types/upload/step.ts'

type getUploadOutcomeProps = {
  stepStates: StepState[]
  cid?: string
}

export function getUploadOutcome({ stepStates, cid }: getUploadOutcomeProps) {
  const hasUploadIpniFailure = stepStates.find((stepState) => stepState.step === 'announcing-cids')?.status === 'error'

  const isUploadFailure = stepStates.some(
    (stepState) => stepState.status === 'error' && stepState.step !== 'announcing-cids'
  )

  const isUploadSuccessful =
    Boolean(cid) &&
    stepStates.every((stepState) => {
      return stepState.status === 'completed' || (stepState.step === 'announcing-cids' && stepState.status === 'error')
    })

  return { hasUploadIpniFailure, isUploadSuccessful, isUploadFailure }
}

type getUploadBadgeStatusProps = {
  isUploadSuccessful: boolean
  isUploadFailure: boolean
  stepStates: StepState[]
}

export function getUploadBadgeStatus({ isUploadSuccessful, isUploadFailure, stepStates }: getUploadBadgeStatusProps) {
  const finalizingTransactionStep = stepStates.find((stepState) => stepState.step === 'finalizing-transaction')
  const announcingCidsStep = stepStates.find((stepState) => stepState.step === 'announcing-cids')

  if (isUploadSuccessful) return 'pinned'
  if (isUploadFailure) return 'error'
  if (finalizingTransactionStep?.status === 'completed' && announcingCidsStep?.status !== 'completed') {
    return 'published'
  }
  if (stepStates.some((stepState) => stepState.status === 'in-progress')) return 'in-progress'
  return 'pending'
}
