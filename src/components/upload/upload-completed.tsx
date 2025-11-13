import type { WaitForIpniProviderResultsOptions } from 'filecoin-pin/core/utils'
import { useMemo, useState } from 'react'
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
  const waitForIpniProviderResultsOptions = useMemo<WaitForIpniProviderResultsOptions>(() => {
    const result: WaitForIpniProviderResultsOptions = {
      maxAttempts: 1,
      expectedProviders: [],
    }
    if (providerInfo?.providerInfo != null) {
      result.expectedProviders = [providerInfo.providerInfo]
    }
    return result
  }, [providerInfo?.providerInfo])

  const shouldPerformIpniCheck = useMemo(() => {
    return (
      waitForIpniProviderResultsOptions.expectedProviders != null &&
      waitForIpniProviderResultsOptions.expectedProviders.length > 0
    )
  }, [waitForIpniProviderResultsOptions.expectedProviders])

  /**
   * Get the status of the IPNI check to change how we render the completed state.
   */
  useIpniCheck({
    cid: cid || null,
    isActive: shouldPerformIpniCheck,
    onSuccess: () => setHasIpniFailure(false),
    onError: () => {
      setHasIpniFailure(true)
    },
    waitForIpniProviderResultsOptions,
  })
  // TODO: fix types, datasetId should never be undefined here...
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
              <TextWithCopyToClipboard href={getIpfsGatewayRenderLink(cid, fileName)} text={cid} />
            )
          }
          title="IPFS Root CID"
        >
          {!hasIpniFailure && <DownloadButton href={getIpfsGatewayDownloadLink(cid, fileName)} />}
        </Card.InfoRow>
      </Card.Wrapper>

      {pieceCid && (
        <Card.Wrapper>
          <Card.InfoRow
            subtitle={<TextWithCopyToClipboard href={getPieceExplorerLink(pieceCid)} text={pieceCid} />}
            title="Filecoin Piece CID"
          >
            <DownloadButton href={getSpCarDownloadLink(cid, serviceURL, fileName)} />
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
