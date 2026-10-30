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
  const [deletingPieceCid, setDeletingPieceCid] = useState<string | null>(null)
  const isDeleting = deletingPieceCid !== null
  const [deletionError, setDeletionError] = useState('')

  const deleteFile = async (selected: DatasetPiece): Promise<boolean> => {
    if (running.current || connection.busy || connection.deleting || !synapse || !ensurePermissions || !storageScope)
      return false
    running.current = true
    setDeletingPieceCid(selected.pieceCid)
    setDeletionError('')
    connection.setDeleting(true)
    try {
      await withFileDeletionLock(storageScope, selected.cid, async () => {
        // Retry retained checkpoints before planning from the latest locked directory.
        await mutateHistory((current) => current)
        if (
          getLatestHistory().some(
            (record) =>
              record.pieceCid === selected.pieceCid &&
              record.upload &&
              record.upload.phase !== 'complete' &&
              record.upload.phase !== 'failed'
          )
        )
          throw new Error('This content has an unfinished upload. Check its status before deleting.')
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
      connection.setDeleting(false)
      running.current = false
      setDeletingPieceCid(null)
    }
  }

  return { deleteFile, isDeleting, deletingPieceCid, deletionError, clearDeletionError: () => setDeletionError('') }
}
