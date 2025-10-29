import { getIpfsGatewayDownloadLink, getIpfsGatewayRenderLink } from '@/utils/links.ts'
import { INPI_ERROR_MESSAGE } from '../../hooks/use-filecoin-upload.ts'
import { useStepStates } from '../../hooks/use-step-states.ts'
import { useUploadProgress } from '../../hooks/use-upload-progress.ts'
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
  const { uploadOutcome } = useUploadProgress({
    stepStates,
    cid,
  })

  const { hasIpniAnnounceFailure } = uploadOutcome

  const { announcingCidsStep, uploadingCarStep } = useStepStates(stepStates)

  const shouldShowCidCard =
    uploadingCarStep?.status === 'completed' &&
    (announcingCidsStep?.status === 'completed' || announcingCidsStep?.status === 'error') &&
    cid

  if (shouldShowCidCard) {
    return (
      <Card.Wrapper>
        {hasIpniAnnounceFailure && <Alert message={INPI_ERROR_MESSAGE} variant="warning" />}
        <Card.InfoRow
          subtitle={
            <TextWithCopyToClipboard
              text={cid}
              {...(!hasIpniAnnounceFailure && { href: getIpfsGatewayRenderLink(cid, fileName) })}
            />
          }
          title="IPFS Root CID"
        >
          {!hasIpniAnnounceFailure && <DownloadButton href={getIpfsGatewayDownloadLink(cid, fileName)} />}
        </Card.InfoRow>
      </Card.Wrapper>
    )
  }

  return (
    <>
      <ProgressCardCombined stepStates={stepStates} />
      {announcingCidsStep && <ProgressCard stepState={announcingCidsStep} />}
    </>
  )
}
