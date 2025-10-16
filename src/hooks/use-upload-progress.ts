import type { Status } from '@/components/ui/badge-status.tsx'
import { useMemo } from 'react'
import type { Progress } from '../types/upload-progress.ts'
import { createStepGroup } from '../utils/upload-status.ts'

export interface UploadProgressInfo {
  /**
   * Get the combined progress percentage for the first stage
   * (creating-car + checking-readiness + uploading-car)
   */
  getCombinedFirstStageProgress: () => number

  /**
   * Get the combined status for the first stage
   */
  getCombinedFirstStageStatus: () => Progress['status']

  /**
   * True if the IPNI announcement step failed
   */
  hasIpniFailure: boolean

  /**
   * True if all steps are completed (treating IPNI failures as acceptable)
   */
  isCompleted: boolean

  /**
   * True if any step has an error (excluding IPNI failures which are acceptable)
   */
  hasError: boolean

  /**
   * Badge status for the file card header
   */
  badgeStatus: Status
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
 *   const { isCompleted, badgeStatus, hasIpniFailure } = useUploadProgress(progresses, cid)
 *
 *   return (
 *     <Card status={badgeStatus}>
 *       {isCompleted ? <CompletedView /> : <ProgressView />}
 *     </Card>
 *   )
 * }
 * ```
 */
export function useUploadProgress(progresses: Progress[], cid?: string): UploadProgressInfo {
  return useMemo(() => {
    // Calculate combined progress for the first stage (creating CAR + checking readiness + uploading)
    const getCombinedFirstStageProgress = () => {
      const { creatingCar, checkingReadiness, uploadingCar } = createStepGroup(progresses)
      const total = creatingCar.progress + checkingReadiness.progress + uploadingCar.progress
      return Math.round(total / 3)
    }

    // Get the status for the combined first stage
    const getCombinedFirstStageStatus = (): Progress['status'] => {
      const { creatingCar, checkingReadiness, uploadingCar } = createStepGroup(progresses)

      // If any stage has error, show error
      if (
        uploadingCar?.status === 'error' ||
        checkingReadiness?.status === 'error' ||
        creatingCar?.status === 'error'
      ) {
        return 'error'
      }

      // If uploading-car is completed, the whole stage is completed
      if (uploadingCar?.status === 'completed') {
        return 'completed'
      }

      // If any stage is in progress OR completed (but not all completed), show in-progress
      const startedStages: Progress['status'][] = ['in-progress', 'completed']
      const hasStarted =
        (uploadingCar?.status && startedStages.includes(uploadingCar.status)) ||
        (checkingReadiness?.status && startedStages.includes(checkingReadiness.status)) ||
        (creatingCar?.status && startedStages.includes(creatingCar.status))

      if (hasStarted) {
        return 'in-progress'
      }

      // Otherwise pending
      return 'pending'
    }

    const hasIpniFailure = progresses.find((p) => p.step === 'announcing-cids')?.status === 'error'

    // Check if all steps are completed AND we have a CID (upload actually finished)
    // BUT treat IPNI failures as still "completed" since file is stored on Filecoin
    const isCompleted =
      Boolean(cid) &&
      progresses.every((p) => {
        return p.status === 'completed' || (p.step === 'announcing-cids' && p.status === 'error')
      })

    // Check if any step is in error (excluding IPNI failures)
    const hasError = progresses.some((p) => p.status === 'error' && p.step !== 'announcing-cids')
    const finalizingStep = progresses.find((p) => p.step === 'finalizing-transaction')
    const announcingStep = progresses.find((p) => p.step === 'announcing-cids')


    // Determine the badge status for the file card header
    const getBadgeStatus = (): UploadProgressInfo['badgeStatus'] => {
      if (isCompleted) return 'pinned'
      if (hasError) return 'error'
      if (finalizingStep?.status === 'completed' && announcingStep?.status !== 'completed') {
        return 'published'
      }
      // Check if any step is in progress
      if (progresses.some((p) => p.status === 'in-progress')) return 'in-progress'
      // If no steps are in progress but not all completed, must be pending
      return 'pending'
    }

    return {
      getCombinedFirstStageProgress,
      getCombinedFirstStageStatus,
      hasIpniFailure,
      isCompleted,
      hasError,
      badgeStatus: getBadgeStatus(),
    }
  }, [progresses, cid])
}
