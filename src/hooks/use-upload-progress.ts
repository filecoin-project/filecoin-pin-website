import { useMemo } from 'react'
import type { Status } from '@/components/ui/badge-status.tsx'
import type { StepState } from '../types/upload/step.ts'
import { getFirstStageProgress, getFirstStageStatus } from '../utils/upload/stage.ts'
import { getUploadBadgeStatus, getUploadOutcome } from '../utils/upload/upload.ts'

export interface UploadProgressInfo {
  firstStageProgress: StepState['progress']
  firstStageStatus: StepState['status']
  hasUploadIpniFailure: boolean
  isUploadSuccessful: boolean
  isUploadFailure: boolean
  uploadBadgeStatus: Status
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
 *   const { isCompleted, badgeStatus, hasUploadIpniFailure } = useUploadProgress(progresses, cid)
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
  return useMemo(() => {
    const firstStageProgress = getFirstStageProgress(stepStates)
    const firstStageStatus = getFirstStageStatus(stepStates)
    const { hasUploadIpniFailure, isUploadSuccessful, isUploadFailure } = getUploadOutcome({ stepStates, cid })
    const uploadBadgeStatus = getUploadBadgeStatus({
      isUploadSuccessful,
      isUploadFailure,
      stepStates,
    })

    return {
      firstStageProgress,
      firstStageStatus,
      hasUploadIpniFailure,
      isUploadSuccessful,
      isUploadFailure,
      uploadBadgeStatus,
    }
  }, [stepStates, cid])
}
