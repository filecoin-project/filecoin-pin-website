import { getIpfsGatewayDownloadLink, getIpfsGatewayRenderLink } from '@/utils/links.ts'
import { COMBINED_STEPS } from '../../constants/upload-status.tsx'
import { INPI_ERROR_MESSAGE } from '../../hooks/use-filecoin-upload.ts'
import { useUploadProgress } from '../../hooks/use-upload-progress.ts'
import type { Progress } from '../../types/upload-progress.ts'
import { Alert } from '../ui/alert.tsx'
import { Card } from '../ui/card.tsx'
import { DownloadButton } from '../ui/download-button.tsx'
import { TextWithCopyToClipboard } from '../ui/text-with-copy-to-clipboard.tsx'
import { ProgressCard } from './progress-card.tsx'
import { ProgressCardCombined } from './progress-card-combined.tsx'

interface CarUploadAndIpniCardProps {
  progresses: Progress[]
  cid?: string
  fileName: string
}

/**
 * This component is used to display the progress of the uploading-car and announcing-cids steps.
 *
 * It will shrink to a single card if the uploading-car and announcing-cids steps are completed.
 * Otherwise, it will display the progress of the uploading-car and announcing-cids steps.
 */
export const CarUploadAndIpniCard = ({ progresses, cid, fileName }: CarUploadAndIpniCardProps) => {
  // Use the upload progress hook to calculate all progress-related values
  const { getCombinedFirstStageProgress, getCombinedFirstStageStatus, hasIpniFailure } = useUploadProgress(
    progresses,
    cid
  )
  const uploadingStep = progresses.find((p) => p.step === 'uploading-car')
  const announcingStep = progresses.find((p) => p.step === 'announcing-cids')

  const shouldShowCidCard =
    uploadingStep?.status === 'completed' &&
    (announcingStep?.status === 'completed' || announcingStep?.status === 'error') &&
    cid

  if (shouldShowCidCard) {
    return (
      <Card.Wrapper>
        {hasIpniFailure && <Alert message={INPI_ERROR_MESSAGE} variant="warning" />}
        <Card.InfoRow
          subtitle={
            <TextWithCopyToClipboard
              text={cid}
              {...(!hasIpniFailure && { href: getIpfsGatewayRenderLink(cid, fileName) })}
            />
          }
          title="IPFS Root CID"
        >
          {!hasIpniFailure && <DownloadButton href={getIpfsGatewayDownloadLink(cid, fileName)} />}
        </Card.InfoRow>
      </Card.Wrapper>
    )
  }

  // Filter progresses to only include the combined steps for ProgressCardCombined
  const combinedProgresses = progresses.filter((p) => COMBINED_STEPS.includes(p.step))

  return (
    <>
      <ProgressCardCombined
        getCombinedFirstStageProgress={getCombinedFirstStageProgress}
        getCombinedFirstStageStatus={getCombinedFirstStageStatus}
        progresses={combinedProgresses}
      />
      {announcingStep && <ProgressCard progress={announcingStep} />}
    </>
  )
}
