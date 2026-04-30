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
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { useIpniCheck } from '../../hooks/use-ipni-check.ts'
import { Alert } from '../ui/alert.tsx'
import { BadgeReplication } from '../ui/badge-replication.tsx'
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
  datasetIds?: UploadStatusProps['datasetIds']
  copyCount?: number
  providerIds?: string[]
  providerNames?: string[]
  serviceURLs?: string[]
}

function UploadCompleted({
  cid,
  fileName,
  pieceCid,
  datasetId,
  datasetIds,
  copyCount,
  providerIds,
  providerNames,
  serviceURLs,
}: UploadCompletedProps) {
  const { dataSet } = useFilecoinPinContext()
  const [hasIpniFailure, setHasIpniFailure] = useState(false)
  const waitForIpniProviderResultsOptions = useMemo<WaitForIpniProviderResultsOptions>(() => {
    return {
      maxAttempts: 1,
      expectedProviders: [],
    }
  }, [])

  const shouldPerformIpniCheck = useMemo(() => {
    return (
      waitForIpniProviderResultsOptions.expectedProviders != null &&
      waitForIpniProviderResultsOptions.expectedProviders.length > 0
    )
  }, [waitForIpniProviderResultsOptions.expectedProviders])

  useIpniCheck({
    cid: cid || null,
    isActive: shouldPerformIpniCheck,
    onSuccess: () => setHasIpniFailure(false),
    onError: () => {
      setHasIpniFailure(true)
    },
    waitForIpniProviderResultsOptions,
  })

  const fallbackDatasetId =
    dataSet.status === 'ready' && dataSet.dataSetIds.length > 0 ? String(dataSet.dataSetIds[0]) : ''
  const datasetIdOrDefault = datasetId || fallbackDatasetId
  const resolvedDatasetIds =
    datasetIds && datasetIds.length > 0 ? datasetIds : datasetIdOrDefault ? [datasetIdOrDefault] : []

  // Build per-copy provider rows aligned with resolvedDatasetIds
  const copyRows = resolvedDatasetIds.map((dsId, i) => ({
    dsId,
    providerId: providerIds?.[i] ?? '',
    providerName: providerNames?.[i] ?? '',
    serviceURL: serviceURLs?.[i] ?? '',
  }))

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
          />
        </Card.Wrapper>
      )}

      {(resolvedDatasetIds.length > 0 || datasetIdOrDefault) && (
        <Card.Wrapper>
          <Card.InfoRow
            subtitle={
              resolvedDatasetIds.length > 1
                ? `Data Sets ${resolvedDatasetIds.join(', ')}`
                : `Data Set ${datasetIdOrDefault}`
            }
            title="Storage"
          >
            {copyCount != null && copyCount > 0 && <BadgeReplication copyCount={copyCount} />}
          </Card.InfoRow>
        </Card.Wrapper>
      )}

      {copyRows.map((row, index) => (
        <Card.Wrapper key={`${row.dsId}-${row.providerId || index}`}>
          <Card.InfoRow
            subtitle={
              row.providerId ? (
                <TextLink href={getProviderExplorerLink(row.providerId)}>
                  {row.providerName || `Provider ${row.providerId}`}
                </TextLink>
              ) : (
                row.providerName || 'Unknown provider'
              )
            }
            title={resolvedDatasetIds.length > 1 ? `Provider ${index + 1} (Data Set ${row.dsId})` : 'Provider'}
          >
            {row.serviceURL && cid && <DownloadButton href={getSpCarDownloadLink(cid, row.serviceURL, fileName)} />}
          </Card.InfoRow>
          <ButtonLink href={getDatasetExplorerLink(row.dsId)}>
            {resolvedDatasetIds.length > 1 ? `View proofs (Data Set ${row.dsId})` : 'View proofs'}
          </ButtonLink>
        </Card.Wrapper>
      ))}
    </>
  )
}

export { UploadCompleted }
