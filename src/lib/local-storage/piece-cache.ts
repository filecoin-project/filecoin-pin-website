/**
 * LocalStorage cache of the upload-history piece list, scoped per wallet.
 *
 * Why cache?
 * ----------
 * Rebuilding history from chain is expensive: `getDetailedDataSet` costs
 * several eth_calls per dataset plus one eth_call per piece for metadata
 * (filename, root CID, tx hash). All of that information is already known
 * in-browser at upload time, so we persist it here and render history from
 * cache with zero RPC calls. The chain fetch only runs when there is no cache
 * (e.g. localStorage was cleared) or when the user explicitly refreshes.
 */

import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

const PIECE_CACHE_KEY = 'filecoin-pin-piece-cache-v1'

const getPieceCacheKey = (walletAddress: string): string => `${PIECE_CACHE_KEY}-${walletAddress}`

/**
 * Read the cached piece list for a wallet.
 *
 * @returns The cached pieces, or null when no cache exists (never written or
 * unparseable). An empty array is a valid cache state ("loaded, no uploads").
 */
export const getCachedPieces = (walletAddress: string): DatasetPiece[] | null => {
  try {
    const raw = localStorage.getItem(getPieceCacheKey(walletAddress))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed as DatasetPiece[]
  } catch (error) {
    console.warn('[PieceCache] Failed to read piece cache from localStorage:', error)
    return null
  }
}

/** Replace the cached piece list for a wallet. */
export const setCachedPieces = (walletAddress: string, pieces: DatasetPiece[]): void => {
  try {
    localStorage.setItem(getPieceCacheKey(walletAddress), JSON.stringify(pieces))
  } catch (error) {
    console.warn('[PieceCache] Failed to write piece cache to localStorage:', error)
  }
}

/** Prepend a piece to the cached list (used after an upload completes). Idempotent by pieceCid. */
export const addCachedPiece = (walletAddress: string, piece: DatasetPiece): void => {
  const current = getCachedPieces(walletAddress) ?? []
  if (current.some((p) => p.pieceCid === piece.pieceCid)) return
  setCachedPieces(walletAddress, [piece, ...current])
}

/** Remove the cached piece list. Called alongside clearStoredDataSetIds so cache and ids stay in lockstep. */
export const clearCachedPieces = (walletAddress: string): void => {
  try {
    localStorage.removeItem(getPieceCacheKey(walletAddress))
  } catch (error) {
    console.warn('[PieceCache] Failed to clear piece cache from localStorage:', error)
  }
}
