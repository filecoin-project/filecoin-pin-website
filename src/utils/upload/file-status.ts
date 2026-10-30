import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { hasRemovalProgress, isDeletionScheduled } from '../file-deletion.ts'

export function fileStatus(file: DatasetPiece) {
  if (file.upload && !(file.copyCount ?? 0)) {
    if (file.upload.phase === 'uploading') return 'Uploading'
    if (file.upload.phase === 'failed') return 'Upload failed'
    if (file.upload.phase === 'interrupted') return 'Upload interrupted'
    return 'Confirming'
  }
  if (isDeletionScheduled(file)) return 'Deletion scheduled'
  if (hasRemovalProgress(file)) return 'Deletion incomplete'
  if (!file.cid) return 'Metadata missing'
  return 'Stored'
}

export function fileStatusColors(status: string) {
  if (status === 'Stored') return 'bg-emerald-500/10 text-success'
  if (status === 'Upload failed') return 'bg-red-500/10 text-danger'
  if (status === 'Metadata missing') return 'bg-surface-raised text-muted'
  return 'bg-amber-500/10 text-warning'
}

export function copyProgress(file: DatasetPiece) {
  const upload = file.upload
  if (!upload || !(file.copyCount ?? 0) || (file.copyCount ?? 0) >= upload.expectedCopies) return null
  if (upload.phase === 'uploading') return 'Uploading'
  if (upload.phase === 'interrupted') return 'Interrupted'
  if (upload.phase === 'failed') return 'Failed'
  if (upload.phase === 'complete') return 'Partial'
  return 'Confirming'
}
