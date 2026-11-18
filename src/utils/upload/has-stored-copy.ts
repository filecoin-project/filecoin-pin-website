import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

/** Indexed records are stored; local upload records require a confirmed copy. */
export function hasStoredCopy(file: Pick<DatasetPiece, 'upload' | 'copyCount'>): boolean {
  return !file.upload || (file.copyCount ?? 0) > 0
}
