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

/** A confirmed removal request is a local tombstone, not proof of physical erasure. */
export function isDeletionScheduled(file: DatasetPiece): boolean {
  const copies = file.datasetIds ?? [file.datasetId]
  return copies.length > 0 && copies.every((id) => file.deletion?.[id]?.confirmed && !file.deletion[id].remaining)
}
