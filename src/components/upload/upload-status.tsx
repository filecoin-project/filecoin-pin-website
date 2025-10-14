import { useCallback } from 'react'
import type { Progress } from '../../types/upload-progress.ts'
import { createStepGroup } from '../../utils/upload-progress.ts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion.tsx'
import { FileInfo } from '../ui/file-info.tsx'
import { UploadCompleted } from './upload-completed.tsx'
import { UploadProgress } from './upload-progress.tsx'

export interface UploadStatusProps {
  fileName: string
  fileSize: string
  progress: Progress[]
  isExpanded?: boolean
  onToggleExpanded?: () => void
  cid?: string
  pieceCid?: string
  providerName?: string
  transactionHash?: string
  network?: string
}

export default function UploadStatus({
  fileName,
  fileSize,
  progress,
  isExpanded = true,
  onToggleExpanded,
  cid,
  pieceCid,
  providerName,
  transactionHash,
  network,
}: UploadStatusProps) {
  // Calculate combined progress for the first stage (creating CAR + checking readiness + uploading)
  const getCombinedFirstStageProgress = useCallback(() => {
    const { creatingCar, checkingReadiness, uploadingCar } = createStepGroup(progress)
    const total = creatingCar.progress + checkingReadiness.progress + uploadingCar.progress
    return Math.round(total / 3)
  }, [progress])

  // Get the status for the combined first stage
  const getCombinedFirstStageStatus = useCallback((): Progress['status'] => {
    const { creatingCar, checkingReadiness, uploadingCar } = createStepGroup(progress)
    // If any stage has error, show error
    if (uploadingCar?.status === 'error' || checkingReadiness?.status === 'error' || creatingCar?.status === 'error') {
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
  }, [progress])

  // Check if all steps are completed AND we have a CID (upload actually finished)
  const isCompleted = progress.every((p) => p.status === 'completed') && !!cid

  // Check if any step is in error
  const hasError = progress.some((p) => p.status === 'error')

  // Determine the badge status for the file card header
  const getBadgeStatus = () => {
    if (isCompleted) return 'pinned'
    if (hasError) return 'error'
    // Check if any step is in progress
    if (progress.some((p) => p.status === 'in-progress')) return 'in-progress'
    // If no steps are in progress but not all completed, must be pending
    return 'pending'
  }

  return (
    <Accordion
      className="rounded-xl space-y-6 overflow-hidden border p-6 border-zinc-700"
      collapsible
      onValueChange={onToggleExpanded ? () => onToggleExpanded() : undefined}
      type="single"
      value={isExpanded ? 'file-card' : ''}
    >
      <AccordionItem value="file-card">
        <FileInfo badgeStatus={getBadgeStatus()} fileName={fileName} fileSize={fileSize}>
          <AccordionTrigger />
        </FileInfo>

        <AccordionContent className="space-y-6 mt-6">
          {isCompleted ? (
            <UploadCompleted cid={cid} network={network} pieceCid={pieceCid} providerName={providerName} />
          ) : (
            <UploadProgress
              getCombinedFirstStageProgress={getCombinedFirstStageProgress}
              getCombinedFirstStageStatus={getCombinedFirstStageStatus}
              progress={progress}
              transactionHash={transactionHash}
            />
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
