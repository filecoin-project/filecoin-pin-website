import { useEffect, useRef, useState } from 'react'
import { useBrowserWallet } from '../context/browser-wallet-provider.tsx'
import { useUploadHistory } from '../context/upload-history-context.tsx'
import {
  DeletionConfirmationPendingError,
  planDeletion,
  scheduleFileDeletion,
  withFileDeletionLock,
} from '../lib/filecoin-pin/delete.ts'
import { applyDeletionUpdate, isDeletionScheduled } from '../utils/file-deletion.ts'
import type { DatasetPiece } from './use-dataset-pieces.ts'
import { useDeletionRecovery } from './use-deletion-recovery.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'

/** Coordinate the content lock, permission check and durable deletion checkpoints. */
export function useFileDeletion() {
  const { synapse, storageScope, ensurePermissions } = useFilecoinPinContext()
  const { history, mutateHistory, getLatestHistory } = useUploadHistory()
  const connection = useBrowserWallet()
  const running = useRef(new Set<string>())
  const [deletingPieceCids, setDeletingPieceCids] = useState<ReadonlySet<string>>(new Set())
  const [deletionErrors, setDeletionErrors] = useState<Record<string, string>>({})
  const autoCheckingPieceCids = useDeletionRecovery(deletingPieceCids, (pieceCid, message) => {
    setDeletionErrors((current) => ({ ...current, [pieceCid]: message }))
  })
  useEffect(() => {
    if (!Object.keys(deletionErrors).length) return
    setDeletionErrors((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([pieceCid]) =>
          history.some((file) => file.pieceCid === pieceCid && !isDeletionScheduled(file))
        )
      )
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [history, deletionErrors])
  const clearDeletionError = (pieceCid: string) =>
    setDeletionErrors((current) => {
      const next = { ...current }
      delete next[pieceCid]
      return next
    })

  const deleteFile = async (selected: DatasetPiece): Promise<boolean> => {
    if (
      running.current.has(selected.pieceCid) ||
      autoCheckingPieceCids.has(selected.pieceCid) ||
      connection.busy ||
      !synapse ||
      !ensurePermissions ||
      !storageScope
    )
      return false
    running.current.add(selected.pieceCid)
    setDeletingPieceCids(new Set(running.current))
    clearDeletionError(selected.pieceCid)
    if (running.current.size === 1) connection.setDeleting(true)
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
      if (cause instanceof DeletionConfirmationPendingError) return false
      setDeletionErrors((current) => ({
        ...current,
        [selected.pieceCid]: cause instanceof Error ? cause.message : 'File deletion failed',
      }))
      return false
    } finally {
      running.current.delete(selected.pieceCid)
      setDeletingPieceCids(new Set(running.current))
      if (!running.current.size) connection.setDeleting(false)
    }
  }

  return { deleteFile, deletingPieceCids, autoCheckingPieceCids, deletionErrors }
}
