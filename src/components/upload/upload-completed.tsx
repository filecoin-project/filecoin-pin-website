import { useState } from 'react'
import { INPI_ERROR_MESSAGE } from '@/hooks/use-filecoin-upload.ts'
import { useIpniCheck } from '../../hooks/use-ipni-check.ts'
import { Alert } from '../ui/alert.tsx'
import { ButtonLink } from '../ui/button/button-link.tsx'
import { Card } from '../ui/card.tsx'
import { DownloadButton } from '../ui/download-button.tsx'
import { TextLink } from '../ui/link.tsx'
import { TextWithCopyToClipboard } from '../ui/text-with-copy-to-clipboard.tsx'

interface UploadCompletedProps {
  cid: string
  pieceCid?: string
  providerName?: string
  network?: string
}

function UploadCompleted({ cid, pieceCid, providerName, network }: UploadCompletedProps) {
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
              <TextWithCopyToClipboard text={cid} />
            ) : (
              <TextWithCopyToClipboard href={`https://dweb.link/ipfs/${cid}`} text={cid} />
            )
          }
          title="IPFS Root CID"
        >
          {!hasIpniFailure && <DownloadButton href={`https://dweb.link/ipfs/${cid}`} />}
        </Card.InfoRow>
      </Card.Wrapper>

      {pieceCid && (
        <Card.Wrapper>
          <Card.InfoRow subtitle={<TextWithCopyToClipboard text={pieceCid} />} title="Filecoin Piece CID">
            <DownloadButton href={`https://pdp.vxb.ai/${network || 'calibration'}/piece/${pieceCid}`} />
          </Card.InfoRow>
        </Card.Wrapper>
      )}

      {providerName && (
        <Card.Wrapper>
          <Card.InfoRow
            subtitle={<TextLink href={`https://filfox.info/en/address/${providerName}`}>{providerName}</TextLink>}
            title="Provider"
          >
            <ButtonLink href={'#'}>View proofs</ButtonLink>
          </Card.InfoRow>
        </Card.Wrapper>
      )}
    </>
  )
}

export { UploadCompleted }
