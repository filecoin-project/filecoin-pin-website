import { findPieceIdsByCid } from '@filoz/synapse-core/pdp-verifier'
import { from as pieceFrom } from '@filoz/synapse-core/piece'
import type { Synapse } from '@filoz/synapse-sdk'
import { BaseError, WaitForTransactionReceiptTimeoutError } from 'viem'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import type { DeletionCheckpoint, DeletionUpdate } from '../../utils/file-deletion.ts'
import { isDeletionScheduled } from '../../utils/file-deletion.ts'
import { type DriveNetwork, publicClient } from './browser-wallet.ts'
import { acquireContentLock } from './content-lock.ts'
import { resolveTransactionReceipt } from './transaction-receipt.ts'

/** Hold through the chain operation and its durable directory checkpoints. */
export async function withFileDeletionLock<T>(scope: string, rootCid: string, operation: () => Promise<T>): Promise<T> {
  const release = await acquireContentLock(scope, rootCid)
  try {
    return await operation()
  } finally {
    await release()
  }
}

export class DeletionConfirmationPendingError extends Error {
  constructor() {
    super('Waiting for deletion confirmation.')
    this.name = 'DeletionConfirmationPendingError'
  }
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
  const results = await Promise.allSettled(
    [...new Set(file.datasetIds ?? [file.datasetId])].map(async (datasetId) => {
      if (file.removedCopies?.includes(datasetId) || file.removalQueuedCopies?.includes(datasetId)) return
      const previous = updated.deletion?.[datasetId]
      if (previous?.confirmed && !previous.remaining) return
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
            return
          }
          throw new Error(`Removal is already queued for dataset ${datasetId}. Check its status on the explorer.`)
        }
        const capacity = Math.max(0, 35 - queued.size)
        if (!capacity) {
          deferred.push(datasetId)
          return
        }
        const pieces = [...unscheduled].slice(0, capacity)
        remaining = pieces.length < unscheduled.size
        hash = await context.deletePieces({ pieces })
        await save(datasetId, { transactionHash: hash, confirmed: false, ...(remaining ? { remaining } : {}) })
      }
      const client = publicClient(file.network as DriveNetwork)
      let messageCid = updated.deletion?.[datasetId]?.messageCid
      let result = await resolveTransactionReceipt(client, { hash, messageCid })
      messageCid = result.messageCid ?? messageCid
      if (messageCid && updated.deletion?.[datasetId]?.messageCid !== messageCid)
        await save(datasetId, {
          transactionHash: hash,
          confirmed: false,
          ...(remaining ? { remaining } : {}),
          messageCid,
        })
      if (result.status === 'pending') {
        try {
          // Disable Ethereum replacement scans: they can fail on Filecoin null rounds.
          const receipt = await client.waitForTransactionReceipt({ hash, checkReplacement: false })
          result = { status: receipt.status, hash: receipt.transactionHash ?? hash }
        } catch (cause) {
          result = await resolveTransactionReceipt(client, { hash, messageCid })
          const recoveredCid = result.messageCid ?? messageCid
          if (recoveredCid && recoveredCid !== messageCid) {
            messageCid = recoveredCid
            await save(datasetId, {
              transactionHash: hash,
              confirmed: false,
              ...(remaining ? { remaining } : {}),
              messageCid,
            })
          }
          if (result.status === 'pending') {
            if (
              cause instanceof BaseError &&
              cause.walk((error) => error instanceof WaitForTransactionReceiptTimeoutError) instanceof
                WaitForTransactionReceiptTimeoutError
            )
              throw new DeletionConfirmationPendingError()
            throw cause
          }
        }
      }
      if (result.status === 'replaced' || result.status === 'reverted') {
        await save(datasetId)
        throw new Error(
          result.status === 'replaced'
            ? `Deletion transaction was replaced by a different operation for dataset ${datasetId}. Check its result before retrying.`
            : `Deletion transaction reverted for dataset ${datasetId}. Retry to submit again.`
        )
      }
      await save(datasetId, {
        transactionHash: result.hash ?? hash,
        confirmed: true,
        ...(remaining ? { remaining } : {}),
        ...(messageCid ? { messageCid } : {}),
      })
      if (remaining) deferred.push(datasetId)
    })
  )
  // Keep the content lock until every copy has saved its outcome, even if another failed.
  const rejected = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason)
  const failures = rejected.filter((cause) => !(cause instanceof DeletionConfirmationPendingError))
  if (deferred.length)
    failures.push(
      new Error(
        `Deletion progress saved. Dataset(s) ${deferred.join(', ')} need another batch. Retry after the provider’s next proving period releases its removal queue.`
      )
    )
  if (!failures.length && rejected.length) throw new DeletionConfirmationPendingError()
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1)
    throw new Error(
      [...new Set(failures.map((cause) => (cause instanceof Error ? cause.message : 'File deletion failed')))].join(
        '\n'
      )
    )
}

/** Plan all active aliases and resumable checkpoints from the latest directory snapshot. */
export function planDeletion(history: DatasetPiece[], selected: DatasetPiece) {
  // Identical uploads can share the same on-chain piece. Explain and track all affected records.
  // Archived receipts belong to earlier uploads and cannot settle a new removal.
  const aliases = history.filter((file) => file.pieceCid === selected.pieceCid && !isDeletionScheduled(file))
  const aliasIds = new Set(aliases.map((file) => file.id))
  const datasetIds = [...new Set(aliases.flatMap((file) => file.datasetIds ?? [file.datasetId]))]
  const deletion: NonNullable<DatasetPiece['deletion']> = {}
  for (const alias of aliases)
    for (const [id, checkpoint] of Object.entries(alias.deletion ?? {})) {
      const previous = deletion[id]
      // Always resolve an outstanding transaction before trusting another record's
      // completed batch. A confirmed batch may also leave more instances to remove.
      if (!previous || (previous.confirmed && (!checkpoint.confirmed || checkpoint.remaining)))
        deletion[id] = checkpoint
    }
  for (const id of datasetIds) {
    const checkpoint = deletion[id]
    // A later upload of identical content can add another piece instance.
    // An older alias's pending or confirmed receipt does not cover that new instance.
    if (
      checkpoint &&
      aliases.some((alias) => (alias.datasetIds ?? [alias.datasetId]).includes(id) && !alias.deletion?.[id])
    )
      deletion[id] = { ...checkpoint, remaining: true }
  }
  const settled = datasetIds.filter((id) =>
    aliases
      .filter((alias) => (alias.datasetIds ?? [alias.datasetId]).includes(id))
      .every((alias) => alias.removedCopies?.includes(id) || alias.removalQueuedCopies?.includes(id))
  )
  return { aliasIds, file: { ...selected, datasetIds, deletion, removedCopies: settled, removalQueuedCopies: [] } }
}
