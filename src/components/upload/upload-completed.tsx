import { INPI_ERROR_MESSAGE } from '@/hooks/use-filecoin-upload.ts'
import {
  getDatasetExplorerLink,
  getIpfsGatewayDownloadLink,
  getIpfsGatewayRenderLink,
  getPieceExplorerLink,
  getSpCarDownloadLink,
} from '@/utils/links.ts'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { ProviderLink } from '../drive/provider-link.tsx'
import { Alert } from '../ui/alert.tsx'
import { BadgeReplication } from '../ui/badge-replication.tsx'
import { ButtonLink } from '../ui/button/button-link.tsx'
import { Card } from '../ui/card.tsx'
import { DownloadButton } from '../ui/download-button.tsx'
import { Heading } from '../ui/heading.tsx'
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
  hasIpniAnnounceFailure: boolean
}

function resolveDatasetIds(datasetIds: string[] | undefined, fallback: string): string[] {
  if (datasetIds != null && datasetIds.length > 0) return datasetIds
  if (fallback) return [fallback]
  return []
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
  hasIpniAnnounceFailure,
}: UploadCompletedProps) {
  const { dataSet, wallet } = useFilecoinPinContext()

  const fallbackDatasetId =
    dataSet.status === 'ready' && dataSet.dataSetIds.length > 0 ? String(dataSet.dataSetIds[0]) : ''
  const datasetIdOrDefault = datasetId || fallbackDatasetId
  const resolvedDatasetIds = resolveDatasetIds(datasetIds, datasetIdOrDefault)

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
        {hasIpniAnnounceFailure && <Alert message={INPI_ERROR_MESSAGE} variant="warning" />}
        <Card.InfoRow
          subtitle={
            hasIpniAnnounceFailure ? (
              <TextWithCopyToClipboard text={cid} />
            ) : (
              <TextWithCopyToClipboard href={getIpfsGatewayRenderLink(cid)} text={cid} />
            )
          }
          title="IPFS Root CID"
        >
          {!hasIpniAnnounceFailure && <DownloadButton href={getIpfsGatewayDownloadLink(cid, fileName)} />}
        </Card.InfoRow>
      </Card.Wrapper>

      {pieceCid && (
        <Card.Wrapper>
          <Card.InfoRow
            subtitle={
              <TextWithCopyToClipboard href={getPieceExplorerLink(pieceCid, wallet.data?.network)} text={pieceCid} />
            }
            title="Filecoin Piece CID"
          />
        </Card.Wrapper>
      )}

      {copyRows.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Heading tag="h3">Storage</Heading>
            {copyCount != null && copyCount > 0 && <BadgeReplication copyCount={copyCount} />}
          </div>

          {copyRows.map((row, index) => {
            const providerLabel =
              row.providerName || (row.providerId ? `Provider ${row.providerId}` : 'Unknown provider')
            return (
              <Card.Wrapper key={`${row.dsId}-${row.providerId || index}`}>
                <Card.InfoRow
                  subtitle={
                    row.providerId ? (
                      <ProviderLink
                        network={wallet.data?.network === 'mainnet' ? 'mainnet' : 'calibration'}
                        providerId={row.providerId}
                      >
                        {providerLabel}
                      </ProviderLink>
                    ) : (
                      providerLabel
                    )
                  }
                  title={`Data Set ${row.dsId}`}
                >
                  {row.serviceURL && cid && (
                    <DownloadButton href={getSpCarDownloadLink(cid, row.serviceURL, fileName)} />
                  )}
                </Card.InfoRow>
                <ButtonLink href={getDatasetExplorerLink(row.dsId, wallet.data?.network)}>View proofs</ButtonLink>
              </Card.Wrapper>
            )
          })}
        </div>
      )}
    </>
  )
}

export { UploadCompleted }
