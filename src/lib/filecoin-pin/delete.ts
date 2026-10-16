import { findPieceIdsByCid } from '@filoz/synapse-core/pdp-verifier'
import { from as pieceFrom } from '@filoz/synapse-core/piece'
import type { Synapse } from '@filoz/synapse-sdk'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import type { DeletionCheckpoint, DeletionUpdate } from '../../utils/file-deletion.ts'
import { requireDirectoryLocks } from '../local-storage/directory-store.ts'
import { type DriveNetwork, publicClient } from './browser-wallet.ts'

/** Coordinate the whole deletion separately from the short directory read/write lock. */
export async function withFileDeletionLock<T>(
  scope: string,
  pieceCid: string,
  operation: () => Promise<T>
): Promise<T> {
  return requireDirectoryLocks().request(
    `filecoin-drive-deletion-${scope}-${pieceCid}`,
    { ifAvailable: true },
    (lock) => {
      if (!lock)
        throw new Error('This content is being deleted in another tab. Wait for it to finish before continuing.')
      return operation()
    }
  )
}

// Persist the hash before waiting. A retry checks that receipt instead of submitting twice.
export async function scheduleFileDeletion(
  synapse: Synapse,
  file: DatasetPiece,
  persist: (file: DatasetPiece, change: DeletionUpdate) => void | Promise<void>
) {
  const updated: DatasetPiece = { ...file, deletion: { ...file.deletion } }
  const save = async (datasetId: string, next?: DeletionCheckpoint) => {
    const previous = updated.deletion?.[datasetId]
    updated.deletion = { ...updated.deletion }
    if (next) updated.deletion[datasetId] = next
    else delete updated.deletion[datasetId]
    await persist({ ...updated }, { datasetId, previous, next })
  }
  const deferred: string[] = []
  for (const datasetId of [...new Set(file.datasetIds ?? [file.datasetId])]) {
    const previous = updated.deletion?.[datasetId]
    if (previous?.confirmed && !previous.remaining) continue
    let hash = (previous?.confirmed ? undefined : previous?.transactionHash) as `0x${string}` | undefined
    let remaining = previous?.remaining ?? false
    if (!hash) {
      const context = await synapse.storage.createContext({ dataSetId: BigInt(datasetId) })
      // A CID can occur more than once in a dataset. Resolve every matching ID,
      // rather than trusting imported IDs or deleting only the first occurrence.
      const queued = new Set(await context.getScheduledRemovals())
      const unscheduled = new Set<bigint>()
      let cursor: bigint | undefined
      let active = 0
      do {
        const page = await findPieceIdsByCid(synapse.client, {
          dataSetId: BigInt(datasetId),
          pieceCid: pieceFrom(file.pieceCid),
          limit: 100n,
          cursor,
        })
        active += page.items.length
        for (const id of page.items) if (!queued.has(id)) unscheduled.add(id)
        cursor = page.nextCursor
      } while (cursor !== undefined)
      if (!active && !previous?.confirmed)
        throw new Error(
          `Piece is no longer active in dataset ${datasetId}. Its removal status needs checking on the explorer.`
        )
      if (!unscheduled.size) {
        // A completed earlier batch may already have drained from the active set.
        if (previous?.confirmed) {
          await save(datasetId, { ...previous, remaining: false })
          continue
        }
        throw new Error(`Removal is already queued for dataset ${datasetId}. Check its status on the explorer.`)
      }
      const capacity = Math.max(0, 35 - queued.size)
      if (!capacity) {
        deferred.push(datasetId)
        continue
      }
      const pieces = [...unscheduled].slice(0, capacity)
      remaining = pieces.length < unscheduled.size
      hash = await context.deletePieces({ pieces })
      await save(datasetId, { transactionHash: hash, confirmed: false, ...(remaining ? { remaining } : {}) })
    }
    const receipt = await publicClient(file.network as DriveNetwork).waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      await save(datasetId)
      throw new Error(`Deletion transaction reverted for dataset ${datasetId}. Retry to submit again.`)
    }
    await save(datasetId, { transactionHash: hash, confirmed: true, ...(remaining ? { remaining } : {}) })
    if (remaining) deferred.push(datasetId)
  }
  if (deferred.length)
    throw new Error(
      `Deletion progress saved. Dataset(s) ${deferred.join(', ')} need another batch. Retry after the provider’s next proving period releases its removal queue.`
    )
}
