import type { DatasetPiece } from '../hooks/use-dataset-pieces.ts'

/** A confirmed removal request is a local tombstone, not proof of physical erasure. */
export function isDeletionScheduled(file: DatasetPiece): boolean {
  const copies = file.datasetIds ?? [file.datasetId]
  return copies.length > 0 && copies.every((id) => file.deletion?.[id]?.confirmed && !file.deletion[id].remaining)
}
