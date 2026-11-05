import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

/** A dataset link needs a per-copy hash or a receipt that can be attributed to that dataset/provider. */
export function storageCopyTransactionHash(file: DatasetPiece, datasetId: string): string | undefined {
  const index = (file.datasetIds ?? [file.datasetId]).indexOf(datasetId)
  if (index < 0) return undefined
  const providerId = file.providerIds?.[index] || (datasetId === file.datasetId ? file.providerId : undefined)
  const providers = file.upload?.providers ?? []
  const belongsToCopy = (provider: (typeof providers)[number]) =>
    provider.dataSetId ? provider.dataSetId === datasetId : Boolean(providerId && provider.providerId === providerId)
  const receipt = providers.find(
    (provider) => !provider.rejected && belongsToCopy(provider) && provider.transactionHash
  )
  if (receipt?.transactionHash) return receipt.transactionHash
  const perCopyHash = file.transactionHashes?.[index]
  if (perCopyHash) {
    const owners = providers.filter((provider) => provider.transactionHash === perCopyHash)
    return owners.length && !owners.some((provider) => !provider.rejected && belongsToCopy(provider))
      ? undefined
      : perCopyHash
  }
  // Legacy stored records have no upload receipt metadata and use a primary hash.
  if (!file.upload && datasetId === file.datasetId) return file.transactionHash || undefined
  return undefined
}
