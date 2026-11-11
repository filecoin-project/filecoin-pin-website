import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { hasStoredCopy } from './has-stored-copy.ts'

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
