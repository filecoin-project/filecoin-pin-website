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
import { Alert } from '../ui/alert.tsx'
import { ButtonLink } from '../ui/button/button-link.tsx'
import { Card } from '../ui/card.tsx'
import { DownloadButton } from '../ui/download-button.tsx'
import { TextLink } from '../ui/link.tsx'
import { TextWithCopyToClipboard } from '../ui/text-with-copy-to-clipboard.tsx'
import type { UploadStatusProps } from './upload-status.tsx'

interface UploadCompletedProps {
  cid: UploadStatusProps['cid']
  fileName: UploadStatusProps['fileName']
  pieceCid?: UploadStatusProps['pieceCid']
  providerName?: UploadStatusProps['providerName']
  providerId?: UploadStatusProps['providerId']
  serviceURL?: UploadStatusProps['serviceURL']
  datasetId?: UploadStatusProps['datasetId']
}

function UploadCompleted({
  cid,
  fileName,
  pieceCid,
  providerName,
  datasetId,
  providerId,
  serviceURL,
}: UploadCompletedProps) {
  // const { ipfsGatewayBaseUrl, providerBaseUrl } = UPLOAD_COMPLETED_LINKS
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
  const cidOrDefault = cid || ''
  const providerIdOrDefault = providerId || ''
  const datasetIdOrDefault = datasetId || ''
  const serviceUrlOrDefault = serviceURL || { serviceUrl: '' }

  return (
    <>
      <Card.Wrapper>
        {hasIpniFailure && <Alert message={INPI_ERROR_MESSAGE} variant="warning" />}
        <Card.InfoRow
          subtitle={
            hasIpniFailure ? (
              <TextWithCopyToClipboard text={cidOrDefault} />
            ) : (
              <TextWithCopyToClipboard
                href={getIpfsGatewayRenderLink(cidOrDefault, fileNameOrDefault)}
                text={cidOrDefault}
              />
            )
          }
          title="IPFS Root CID"
        >
          {!hasIpniFailure && <DownloadButton href={getIpfsGatewayDownloadLink(cidOrDefault, fileNameOrDefault)} />}
        </Card.InfoRow>
      </Card.Wrapper>

      {pieceCid && (
        <Card.Wrapper>
          <Card.InfoRow
            subtitle={<TextWithCopyToClipboard href={getPieceExplorerLink(pieceCid)} text={pieceCid} />}
            title="Filecoin Piece CID"
          >
            <DownloadButton href={getSpCarDownloadLink(cidOrDefault, serviceUrlOrDefault)} />
          </Card.InfoRow>
        </Card.Wrapper>
      )}

      {providerName && (
        <Card.Wrapper>
          <Card.InfoRow
            subtitle={<TextLink href={getProviderExplorerLink(providerIdOrDefault)}>{providerName}</TextLink>}
            title="Provider"
          >
            <ButtonLink href={getDatasetExplorerLink(datasetIdOrDefault)}>View proofs</ButtonLink>
          </Card.InfoRow>
        </Card.Wrapper>
      )}
    </>
  )
}

export { UploadCompleted }
