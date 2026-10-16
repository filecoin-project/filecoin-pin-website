/** Browser file directory, scoped by chain ID and wallet address. Chain reads
 * cannot reconstruct names or IPFS root CIDs; this is durable local metadata,
 * rather than a disposable RPC cache. Directory backups make it portable.
 */

import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { createDirectoryStore } from './directory-store.ts'

const PIECE_CACHE_KEY = 'filecoin-pin-piece-cache-v1'

const getPieceCacheKey = (walletAddress: string): string => `${PIECE_CACHE_KEY}-${walletAddress}`

const store = createDirectoryStore<DatasetPiece[]>(getPieceCacheKey, (raw) => {
  if (raw === null) return []
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('Invalid browser file directory. Export a backup before continuing.')
  return parsed as DatasetPiece[]
})

export const mutateCachedPieces = store.mutate
export const subscribeCachedPieces = store.subscribe
export const hasUnsavedPieces = store.hasUnsaved

/**
 * Read the cached piece list for a wallet.
 *
 * @returns The cached pieces, or null when no cache exists (never written or
 * unparseable). An empty array is a valid cache state ("loaded, no uploads").
 */
export const getCachedPieces = (walletAddress: string): DatasetPiece[] | null => {
  try {
    if (localStorage.getItem(getPieceCacheKey(walletAddress)) === null && !store.hasUnsaved(walletAddress)) return null
    return store.read(walletAddress)
  } catch (error) {
    console.warn('[PieceCache] Failed to read piece cache from localStorage:', error)
    return null
  }
}

/** Low-level initialization helper. Live directory changes must use mutateCachedPieces. */
export const setCachedPieces = (walletAddress: string, pieces: DatasetPiece[]): boolean => {
  try {
    localStorage.setItem(getPieceCacheKey(walletAddress), JSON.stringify(pieces))
    store.reset(walletAddress)
    return true
  } catch (error) {
    console.warn('[PieceCache] Failed to write piece cache to localStorage:', error)
    return false
  }
}

/** Prepend a piece to the cached list (used after an upload completes). Idempotent by file record ID. */
export const addCachedPiece = (walletAddress: string, piece: DatasetPiece): Promise<DatasetPiece[]> =>
  mutateCachedPieces(walletAddress, (current) => {
    const previous = current.find((record) => record.id === piece.id)
    const next = previous
      ? {
          ...mergeStorageCopies(previous, piece),
          ipfsIndexed: previous.ipfsIndexed === true || piece.ipfsIndexed === true,
        }
      : piece
    return [next, ...current.filter((record) => record.id !== piece.id)]
  })

/** Merge storage facts without reverting names, folders, indexing progress or removal receipts. */
export function mergeStorageCopies(recorded: DatasetPiece, incoming: DatasetPiece): DatasetPiece {
  const recordedIds = recorded.datasetIds ?? [recorded.datasetId]
  const incomingIds = incoming.datasetIds ?? [incoming.datasetId]
  const datasetIds = [...new Set([...recordedIds, ...incomingIds])]
  const mergeField = (
    plural: 'providerIds' | 'providerNames' | 'serviceURLs' | 'transactionHashes' | 'pieceIds',
    singular: 'providerId' | 'providerName' | 'serviceURL' | 'transactionHash' | 'pieceId'
  ) =>
    datasetIds.map((id) => {
      const value = (file: DatasetPiece, ids: string[]) => {
        const index = ids.indexOf(id)
        return index < 0 ? '' : file[plural]?.[index] || (index === 0 ? String(file[singular] ?? '') : '')
      }
      return value(recorded, recordedIds) || value(incoming, incomingIds)
    })
  const providerIds = mergeField('providerIds', 'providerId')
  const providerNames = mergeField('providerNames', 'providerName')
  const serviceURLs = mergeField('serviceURLs', 'serviceURL')
  const transactionHashes = mergeField('transactionHashes', 'transactionHash')
  return {
    ...incoming,
    ...recorded,
    datasetIds,
    copyCount: datasetIds.length,
    providerIds,
    providerNames,
    serviceURLs,
    transactionHashes,
    pieceIds: mergeField('pieceIds', 'pieceId'),
    providerId: providerIds[0],
    providerName: providerNames[0],
    serviceURL: serviceURLs[0],
    transactionHash: transactionHashes[0],
  }
}

/** Remove the cached piece list. Called alongside clearStoredDataSetIds so cache and ids stay in lockstep. */
export const clearCachedPieces = (walletAddress: string): void => {
  try {
    localStorage.removeItem(getPieceCacheKey(walletAddress))
    store.reset(walletAddress)
  } catch (error) {
    console.warn('[PieceCache] Failed to clear piece cache from localStorage:', error)
  }
}
