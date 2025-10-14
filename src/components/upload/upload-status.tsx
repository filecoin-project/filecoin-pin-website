import { useCallback } from 'react'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import type { Progress } from '../../types/upload-progress.ts'
import { createStepGroup } from '../../utils/upload-status.ts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion.tsx'
import { FileInfo } from '../ui/file-info.tsx'
import { UploadCompleted } from './upload-completed.tsx'
import { UploadProgress } from './upload-progress.tsx'

export interface UploadStatusProps {
  fileName: DatasetPiece['fileName']
  fileSize: DatasetPiece['fileSize']
  progresses: Array<Progress>
  isExpanded?: boolean
  onToggleExpanded?: () => void
  cid?: DatasetPiece['cid']
  pieceCid?: DatasetPiece['pieceCid']
  providerName?: DatasetPiece['providerName']
  transactionHash?: DatasetPiece['transactionHash']
  network?: DatasetPiece['network']
  providerId?: DatasetPiece['providerId']
  datasetId?: DatasetPiece['datasetId']
  serviceURL?: DatasetPiece['serviceURL']
}

function UploadStatus({
  fileName,
  fileSize,
  progresses,
  isExpanded = true,
  onToggleExpanded,
  cid,
  datasetId,
  pieceCid,
  providerName,
  providerId,
  serviceURL,
  transactionHash,
}: UploadStatusProps) {
  // Calculate combined progress for the first stage (creating CAR + checking readiness + uploading)
  const getCombinedFirstStageProgress = useCallback(() => {
    const { creatingCar, checkingReadiness, uploadingCar } = createStepGroup(progresses)
    const total = creatingCar.progress + checkingReadiness.progress + uploadingCar.progress
    return Math.round(total / 3)
  }, [progresses])

  // Get the status for the combined first stage
  const getCombinedFirstStageStatus = useCallback((): Progress['status'] => {
    const { creatingCar, checkingReadiness, uploadingCar } = createStepGroup(progresses)
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
  }, [progresses])

  // Check if all steps are completed AND we have a CID (upload actually finished)
  // BUT treat IPNI failures as still "completed" since file is stored on Filecoin
  const isCompleted =
    Boolean(cid) &&
    progresses.every((p) => {
      return p.status === 'completed' || (p.step === 'announcing-cids' && p.status === 'error')
    })

  // Check if any step is in error (excluding IPNI failures)
  const hasError = progresses.some((p) => p.status === 'error' && p.step !== 'announcing-cids')

  // Determine the badge status for the file card header
  function getBadgeStatus() {
    if (isCompleted) return 'publishing'
    if (hasError) return 'error'
    // Check if any step is in progress
    if (progresses.some((p) => p.status === 'in-progress')) return 'in-progress'
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
          {isCompleted && cid ? (
            <UploadCompleted
              cid={cid}
              datasetId={datasetId}
              fileName={fileName}
              pieceCid={pieceCid}
              providerId={providerId}
              providerName={providerName}
              serviceURL={serviceURL}
            />
          ) : (
            <UploadProgress
              getCombinedFirstStageProgress={getCombinedFirstStageProgress}
              getCombinedFirstStageStatus={getCombinedFirstStageStatus}
              progresses={progresses}
              transactionHash={transactionHash}
            />
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export { UploadStatus }
