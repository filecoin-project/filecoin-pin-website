import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

export function canRemoveUpload(file: DatasetPiece) {
  const upload = file.upload
  return Boolean(
    upload &&
      (upload.phase === 'waiting' ||
        upload.phase === 'funding' ||
        upload.phase === 'failed' ||
        upload.phase === 'interrupted') &&
      !file.copyCount &&
      !file.datasetId &&
      !file.datasetIds?.length &&
      upload.providers.every((provider) => !provider.confirmed && (!provider.transactionHash || provider.rejected))
  )
}
