import type { DatasetPiece } from '../hooks/use-dataset-pieces.ts'

export type DeletionCheckpoint = NonNullable<DatasetPiece['deletion']>[string]
export interface DeletionUpdate {
  datasetId: string
  previous?: DeletionCheckpoint
  next?: DeletionCheckpoint
}

/** Apply one transaction's progress without replacing other datasets or newer receipts. */
export function applyDeletionUpdate(file: DatasetPiece, { datasetId, previous, next }: DeletionUpdate): DatasetPiece {
  if (!(file.datasetIds ?? [file.datasetId]).includes(datasetId) || isDeletionScheduled(file)) return file
  const current = file.deletion?.[datasetId]
  // Failed writes may be replayed after another tab has advanced to a newer transaction.
  if (
    current &&
    current.transactionHash !== previous?.transactionHash &&
    current.transactionHash !== next?.transactionHash
  )
    return file
  if (
    current?.confirmed &&
    (!next ||
      (current.transactionHash === next.transactionHash && (!next.confirmed || (!current.remaining && next.remaining))))
  )
    return file
  const deletion = { ...file.deletion }
  if (next) deletion[datasetId] = next
  else delete deletion[datasetId]
  return { ...file, deletion }
}

export const hasRemovalProgress = (file: DatasetPiece): boolean =>
  Boolean(file.deletion || file.removedCopies?.length || file.removalQueuedCopies?.length)

/** Queue entries and local receipts acknowledge scheduling, not physical erasure. */
export function isCopyRemovalScheduled(file: DatasetPiece, id: string): boolean {
  return Boolean(
    file.removedCopies?.includes(id) ||
      file.removalQueuedCopies?.includes(id) ||
      (file.deletion?.[id]?.confirmed && !file.deletion[id].remaining)
  )
}

export function isDeletionScheduled(file: DatasetPiece): boolean {
  const copies = file.datasetIds ?? [file.datasetId]
  return copies.length > 0 && copies.every((id) => isCopyRemovalScheduled(file, id))
}
