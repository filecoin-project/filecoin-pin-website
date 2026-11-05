import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

/** A stopped partial upload can delete confirmed copies, but uncertain submissions must settle first. */
export function blocksFileDeletion(file: DatasetPiece): boolean {
  const upload = file.upload
  if (!upload) return false
  const unresolved = upload.providers.some(
    (provider) => !provider.confirmed && !provider.rejected && (provider.transactionHash || provider.stored)
  )
  if (unresolved) return true
  if (upload.phase === 'complete' || upload.phase === 'failed') return false
  return !(upload.phase === 'interrupted' && hasStoredCopy(file))
}

/** Target eligibility is separate from whether a related upload still blocks deletion. */
export function hasStoredCopy(file: DatasetPiece): boolean {
  return !file.upload || (file.copyCount ?? 0) > 0
}
