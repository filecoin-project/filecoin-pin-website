import { WaitForAddPiecesRejectedError, WaitForCreateDataSetRejectedError } from '@filoz/synapse-core/errors'
import { findPieceIdsByCid } from '@filoz/synapse-core/pdp-verifier'
import { from } from '@filoz/synapse-core/piece'
import { waitForAddPieces, waitForCreateDataSetAddPieces } from '@filoz/synapse-core/sp'
import type { Synapse } from '@filoz/synapse-sdk'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import type { UploadProviderCheckpoint } from './upload-checkpoint.ts'

export const CONFIRMATION_CHECK_LIMIT = 20
export const CONFIRMATION_CHECK_INTERVAL = 30_000

/** Read existing operations only. Timeouts and missing hashes never authorize resubmission. */
export async function recoverUpload(synapse: Synapse, file: DatasetPiece, signal: AbortSignal): Promise<DatasetPiece> {
  const upload = file.upload
  if (!upload || upload.phase === 'complete' || upload.phase === 'failed') return file
  if (!file.pieceCid)
    return {
      ...file,
      upload: {
        ...upload,
        phase: 'interrupted',
        error:
          upload.phase === 'waiting'
            ? 'The page closed before this queued upload started. Select the original file to upload it.'
            : 'The page closed before receipt of the file was saved. Select the original file to try again.',
      },
    }
  const providers = await Promise.all(
    upload.providers.map(async (provider): Promise<UploadProviderCheckpoint> => {
      if (provider.confirmed || provider.rejected || !provider.transactionHash) return provider
      try {
        const statusUrl = new URL(
          provider.dataSetId
            ? `/pdp/data-sets/${provider.dataSetId}/pieces/added/${provider.transactionHash}`
            : `/pdp/data-sets/created/${provider.transactionHash}`,
          provider.serviceURL
        ).href
        const options = { statusUrl, timeout: 10_000, retryCount: 0, signal }
        const result = provider.dataSetId
          ? await waitForAddPieces(options)
          : await waitForCreateDataSetAddPieces(options)
        const dataSetId = result.dataSetId
        const ids = 'confirmedPieceIds' in result ? result.confirmedPieceIds : result.piecesIds
        // A batched transaction can contain other files: never use its first ID blindly.
        let cursor: bigint | undefined
        let pieceId: bigint | undefined
        do {
          signal.throwIfAborted()
          const page = await findPieceIdsByCid(synapse.readClient, {
            dataSetId,
            pieceCid: from(file.pieceCid),
            cursor,
            limit: 100n,
          })
          pieceId = page.items.find((id) => ids.includes(id))
          cursor = page.nextCursor
        } while (pieceId === undefined && cursor !== undefined)
        if (pieceId === undefined) return provider
        return {
          ...provider,
          dataSetId: String(dataSetId),
          pieceId: String(pieceId),
          transactionHash: result.confirmedTxHash ?? provider.transactionHash,
          confirmed: true,
        }
      } catch (cause) {
        signal.throwIfAborted()
        return WaitForAddPiecesRejectedError.is(cause) || WaitForCreateDataSetRejectedError.is(cause)
          ? { ...provider, rejected: true }
          : provider
      }
    })
  )
  const confirmed = providers.filter(
    (provider) => provider.confirmed && provider.dataSetId && provider.pieceId !== undefined
  )
  const complete = providers.length > 0 && providers.every((provider) => provider.confirmed || provider.rejected)
  const failed = !confirmed.length && providers.length > 0 && providers.every((provider) => provider.rejected)
  const primary = confirmed[0]
  const missingSubmission =
    providers.length === 0 ||
    providers.some((provider) => !provider.confirmed && !provider.rejected && !provider.transactionHash)
  const pendingSubmission = providers.some(
    (provider) => !provider.confirmed && !provider.rejected && provider.transactionHash
  )
  const interrupted = !complete && missingSubmission && !pendingSubmission
  return {
    ...file,
    ...(primary
      ? {
          datasetId: primary.dataSetId ?? '',
          pieceId: Number(primary.pieceId),
          providerId: primary.providerId,
          serviceURL: primary.serviceURL,
          transactionHash: primary.transactionHash ?? '',
          datasetIds: confirmed.map((provider) => provider.dataSetId as string),
          pieceIds: confirmed.map((provider) => provider.pieceId as string),
          providerIds: confirmed.map((provider) => provider.providerId),
          serviceURLs: confirmed.map((provider) => provider.serviceURL),
          transactionHashes: confirmed.map((provider) => provider.transactionHash ?? ''),
          copyCount: confirmed.length,
        }
      : {}),
    upload: {
      ...upload,
      providers,
      phase: failed ? 'failed' : complete ? 'complete' : interrupted ? 'interrupted' : 'pending',
      error: failed
        ? 'Storage providers rejected this upload. Select the original file to retry.'
        : complete
          ? undefined
          : missingSubmission
            ? 'Not all storage submission receipts were saved. Background upload work has stopped. Check status can discover existing confirmations, but cannot resume unfinished upload steps.'
            : 'Storage confirmation is taking longer than expected. This does not mean your upload failed.',
    },
  }
}
