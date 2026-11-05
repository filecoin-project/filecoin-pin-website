import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

/** A stopped partial upload can delete confirmed copies, but uncertain submissions must settle first. */
export function blocksFileDeletion(file: DatasetPiece): boolean {
  const upload = file.upload
  if (!upload) return false
  const unresolved = upload.providers.some(
    (provider) => !provider.confirmed && !provider.rejected && (provider.transactionHash || provider.stored)
  )
  if (unresolved) return true
  if (upload.phase === 'complete') return false
  return !(['interrupted', 'failed'].includes(upload.phase) && (file.copyCount ?? 0) > 0)
}
