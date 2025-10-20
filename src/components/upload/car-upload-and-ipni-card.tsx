import { getIpfsGatewayDownloadLink, getIpfsGatewayRenderLink } from '@/utils/links.ts'
import { INPI_ERROR_MESSAGE } from '../../hooks/use-filecoin-upload.ts'
import { useUploadProgress } from '../../hooks/use-upload-progress.ts'
import { STAGE_STEPS } from '../../types/upload/stage.ts'
import type { StepState } from '../../types/upload/step.ts'
import { Alert } from '../ui/alert.tsx'
import { Card } from '../ui/card.tsx'
import { DownloadButton } from '../ui/download-button.tsx'
import { TextWithCopyToClipboard } from '../ui/text-with-copy-to-clipboard.tsx'
import { ProgressCard } from './progress-card.tsx'
import { ProgressCardCombined } from './progress-card-combined.tsx'

interface CarUploadAndIpniCardProps {
  stepStates: StepState[]
  cid?: string
  fileName: string
}

/**
 * This component is used to display the progress of the uploading-car and announcing-cids steps.
 *
 * It will shrink to a single card if the uploading-car and announcing-cids steps are completed.
 * Otherwise, it will display the progress of the uploading-car and announcing-cids steps.
 */
export const CarUploadAndIpniCard = ({ stepStates, cid, fileName }: CarUploadAndIpniCardProps) => {
  // Use the upload progress hook to calculate all progress-related values
  const { firstStageProgress, firstStageStatus, hasUploadIpniFailure } = useUploadProgress({
    stepStates,
    cid,
  })
  const uploadingStep = stepStates.find((stepState) => stepState.step === 'uploading-car')
  const announcingStep = stepStates.find((stepState) => stepState.step === 'announcing-cids')

  const shouldShowCidCard =
    uploadingStep?.status === 'completed' &&
    (announcingStep?.status === 'completed' || announcingStep?.status === 'error') &&
    cid

  if (shouldShowCidCard) {
    return (
      <Card.Wrapper>
        {hasUploadIpniFailure && <Alert message={INPI_ERROR_MESSAGE} variant="warning" />}
        <Card.InfoRow
          subtitle={
            <TextWithCopyToClipboard
              text={cid}
              {...(!hasUploadIpniFailure && { href: getIpfsGatewayRenderLink(cid, fileName) })}
            />
          }
          title="IPFS Root CID"
        >
          {!hasUploadIpniFailure && <DownloadButton href={getIpfsGatewayDownloadLink(cid, fileName)} />}
        </Card.InfoRow>
      </Card.Wrapper>
    )
  }

  // Filter progresses to only include the combined steps for ProgressCardCombined
  const firstStageStates = stepStates.filter((stepState) => STAGE_STEPS['first-stage'].includes(stepState.step))

  return (
    <>
      <ProgressCardCombined
        firstStageProgress={firstStageProgress}
        firstStageStatus={firstStageStatus}
        stepStates={firstStageStates}
      />
      {announcingStep && <ProgressCard stepState={announcingStep} />}
    </>
  )
}
