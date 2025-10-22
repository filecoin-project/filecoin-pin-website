import { useMemo } from 'react'
import type { Status } from '@/components/ui/badge-status.tsx'
import type { StepState } from '../types/upload/step.ts'
import { getUploadBadgeStatus, getUploadOutcome } from '../utils/upload/upload.ts'
import { useStepStates } from './use-step-states.ts'

type UploadOutcome = {
  hasIpniAnnounceFailure: boolean
  isUploadSuccessful: boolean
  isUploadFailure: boolean
}

type UploadBadgeStatus = Status

export interface UploadProgressInfo {
  uploadOutcome: UploadOutcome
  uploadBadgeStatus: UploadBadgeStatus
}

type useUploadProgressProps = {
  stepStates: StepState[]
  cid?: string
}

/**
 * Hook to calculate and manage upload progress state.
 *
 * Centralizes all progress calculation logic to follow DRY principles
 * and eliminate prop drilling of computed functions.
 *
 * @param progresses Array of progress steps
 * @param cid Optional CID - used to determine if upload is truly completed
 * @returns Computed progress information and helper functions
 *
 * @example
 * ```tsx
 * function UploadCard({ progresses, cid }) {
 *   const { isCompleted, badgeStatus, hasIpniAnnounceFailure } = useUploadProgress(progresses, cid)
 *
 *   return (
 *     <Card status={badgeStatus}>
 *       {isCompleted ? <CompletedView /> : <ProgressView />}
 *     </Card>
 *   )
 * }
 * ```
 */
export function useUploadProgress({ stepStates, cid }: useUploadProgressProps): UploadProgressInfo {
  const { finalizingStep, announcingCidsStep } = useStepStates(stepStates)

  return useMemo(() => {
    const { hasIpniAnnounceFailure, isUploadSuccessful, isUploadFailure } = getUploadOutcome({ stepStates, cid })

    const uploadBadgeStatus = getUploadBadgeStatus({
      isUploadSuccessful,
      isUploadFailure,
      stepStates,
      finalizingStep,
      announcingCidsStep,
    })

    return {
      uploadOutcome: {
        hasIpniAnnounceFailure,
        isUploadSuccessful,
        isUploadFailure,
      },
      uploadBadgeStatus,
    }
  }, [stepStates, cid])
}
