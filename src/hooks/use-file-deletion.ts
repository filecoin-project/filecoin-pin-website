import { useRef, useState } from 'react'
import { useBrowserWallet } from '../context/browser-wallet-provider.tsx'
import { useUploadHistory } from '../context/upload-history-context.tsx'
import { planDeletion, scheduleFileDeletion, withFileDeletionLock } from '../lib/filecoin-pin/delete.ts'
import { applyDeletionUpdate } from '../utils/file-deletion.ts'
import type { DatasetPiece } from './use-dataset-pieces.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'

/** Coordinate the content lock, permission check and durable deletion checkpoints. */
export function useFileDeletion() {
  const { synapse, storageScope, ensurePermissions } = useFilecoinPinContext()
  const { mutateHistory, getLatestHistory } = useUploadHistory()
  const connection = useBrowserWallet()
  const running = useRef(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletionError, setDeletionError] = useState('')

  const deleteFile = async (selected: DatasetPiece): Promise<boolean> => {
    if (running.current || connection.busy || connection.uploading || !synapse || !ensurePermissions || !storageScope)
      return false
    running.current = true
    setIsDeleting(true)
    setDeletionError('')
    connection.setUploading(true)
    try {
      await withFileDeletionLock(storageScope, selected.cid, async () => {
        // Retry retained checkpoints before planning from the latest locked directory.
        await mutateHistory((current) => current)
        await ensurePermissions()
        const { aliasIds, file } = planDeletion(getLatestHistory(), selected)
        await mutateHistory((current) =>
          current.map((record) => (aliasIds.has(record.id) && !record.deletion ? { ...record, deletion: {} } : record))
        )
        await scheduleFileDeletion(synapse, file, async (_changed, change) => {
          await mutateHistory((current) =>
            current.map((record) => (aliasIds.has(record.id) ? applyDeletionUpdate(record, change) : record))
          )
        })
      })
      return true
    } catch (cause) {
      setDeletionError(cause instanceof Error ? cause.message : 'File deletion failed')
      return false
    } finally {
      connection.setUploading(false)
      running.current = false
      setIsDeleting(false)
    }
  }

  return { deleteFile, isDeleting, deletionError, clearDeletionError: () => setDeletionError('') }
}
