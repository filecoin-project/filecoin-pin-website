import { useState } from 'react'
import { INPI_ERROR_MESSAGE } from '@/hooks/use-filecoin-upload.ts'
import { useIpniCheck } from '../../hooks/use-ipni-check.ts'
import { UPLOAD_COMPLETED_LINKS } from '@/constants/upload-completed-links.ts'
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
  network?: string
}

function UploadCompleted({
  cid,
  fileName,
  pieceCid,
  providerName,
  datasetId,
  providerId,
  serviceURL,
  network,
}: UploadCompletedProps) {
  const { ipfsBaseUrl, providerBaseUrl } = UPLOAD_COMPLETED_LINKS
  const [hasIpniFailure, setHasIpniFailure] = useState(false)

  /**
   * Get the status of the IPNI check to change how we render the completed state.
   */
  useIpniCheck({
    cid,
    isActive: true,
    onSuccess: () => setHasIpniFailure(false),
    maxAttempts: 1,
    onError: (error) => {
      console.error('[UploadCompleted] IPNI check failed:', error)
      setHasIpniFailure(true)
    },
  })
  return (
    <>
      <Card.Wrapper>
        {hasIpniFailure && <Alert message={INPI_ERROR_MESSAGE} variant="warning" />}
        <Card.InfoRow
          subtitle={
            hasIpniFailure ? (
              <TextWithCopyToClipboard text={cid || ''} />
            ) : (
              <TextWithCopyToClipboard href={`${ipfsBaseUrl}${cid}`} text={cid || ''} />
            )
          }
          title="IPFS Root CID"
        >
          {!hasIpniFailure && <DownloadButton href={`${ipfsBaseUrl}${cid}?download=true&filename=${fileName}`} />}
        </Card.InfoRow>
      </Card.Wrapper>

      {pieceCid && (
        <Card.Wrapper>
          <Card.InfoRow subtitle={<TextWithCopyToClipboard text={pieceCid} />} title="Filecoin Piece CID">
            <DownloadButton href={`${serviceURL}/piece/${pieceCid}`} />
          </Card.InfoRow>
        </Card.Wrapper>
      )}

      {providerName && (
        <Card.Wrapper>
          <Card.InfoRow
            subtitle={<TextLink href={`${providerBaseUrl}/providers/${providerId}`}>{providerName}</TextLink>}
            title="Provider"
          >
            <ButtonLink href={`${providerBaseUrl}/dataset/${datasetId}`}>View proofs</ButtonLink>
          </Card.InfoRow>
        </Card.Wrapper>
      )}
    </>
  )
}

export { UploadCompleted }
