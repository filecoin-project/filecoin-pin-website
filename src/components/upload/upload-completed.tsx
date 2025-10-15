import { useState } from 'react'
// import { UPLOAD_COMPLETED_LINKS } from '@/constants/upload-completed-links.ts'
import { INPI_ERROR_MESSAGE } from '@/hooks/use-filecoin-upload.ts'
import {
  getDatasetExplorerLink,
  getIpfsGatewayDownloadLink,
  getIpfsGatewayRenderLink,
  getPieceExplorerLink,
  getProviderExplorerLink,
  getSpCarDownloadLink,
} from '@/utils/links.ts'
import { useIpniCheck } from '../../hooks/use-ipni-check.ts'
import { useProviderInfo } from '../../hooks/use-provider-info.ts'
import { Alert } from '../ui/alert.tsx'
import { ButtonLink } from '../ui/button/button-link.tsx'
import { Card } from '../ui/card.tsx'
import { DownloadButton } from '../ui/download-button.tsx'
import { TextLink } from '../ui/link.tsx'
import { TextWithCopyToClipboard } from '../ui/text-with-copy-to-clipboard.tsx'
import type { UploadStatusProps } from './upload-status.tsx'

interface UploadCompletedProps {
  cid: string
  fileName: UploadStatusProps['fileName']
  pieceCid?: UploadStatusProps['pieceCid']
  datasetId?: UploadStatusProps['datasetId']
}

function UploadCompleted({ cid, fileName, pieceCid, datasetId }: UploadCompletedProps) {
  // Get provider info from context via hook
  const providerInfo = useProviderInfo()
  const [hasIpniFailure, setHasIpniFailure] = useState(false)

  /**
   * Get the status of the IPNI check to change how we render the completed state.
   */
  useIpniCheck({
    cid: cid || null,
    isActive: true,
    onSuccess: () => setHasIpniFailure(false),
    maxAttempts: 1,
    onError: (error) => {
      console.error('[UploadCompleted] IPNI check failed:', error)
      setHasIpniFailure(true)
    },
  })
  const fileNameOrDefault = fileName || 'file'
  const datasetIdOrDefault = datasetId || providerInfo?.datasetId || ''

  // If provider info is not ready, show a loading state
  if (!providerInfo) {
    return (
      <Card.Wrapper>
        <Card.InfoRow subtitle="Loading provider information..." title="Upload Complete" />
      </Card.Wrapper>
    )
  }

  const { providerAddress, providerName, serviceURL } = providerInfo

  return (
    <>
      <Card.Wrapper>
        {hasIpniFailure && <Alert message={INPI_ERROR_MESSAGE} variant="warning" />}
        <Card.InfoRow
          subtitle={
            hasIpniFailure ? (
              <TextWithCopyToClipboard text={cid} />
            ) : (
              <TextWithCopyToClipboard href={getIpfsGatewayRenderLink(cid, fileNameOrDefault)} text={cid} />
            )
          }
          title="IPFS Root CID"
        >
          {!hasIpniFailure && <DownloadButton href={getIpfsGatewayDownloadLink(cid, fileNameOrDefault)} />}
        </Card.InfoRow>
      </Card.Wrapper>

      {pieceCid && (
        <Card.Wrapper>
          <Card.InfoRow
            subtitle={<TextWithCopyToClipboard href={getPieceExplorerLink(pieceCid)} text={pieceCid} />}
            title="Filecoin Piece CID"
          >
            <DownloadButton href={getSpCarDownloadLink(cid, serviceURL)} />
          </Card.InfoRow>
        </Card.Wrapper>
      )}

      <Card.Wrapper>
        <Card.InfoRow
          subtitle={<TextLink href={getProviderExplorerLink(providerAddress)}>{providerName}</TextLink>}
          title="Provider"
        >
          <ButtonLink href={getDatasetExplorerLink(datasetIdOrDefault)}>View proofs</ButtonLink>
        </Card.InfoRow>
      </Card.Wrapper>
    </>
  )
}

export { UploadCompleted }
