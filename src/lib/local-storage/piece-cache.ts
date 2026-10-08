/** Browser file directory, scoped by chain ID and wallet address. Chain reads
 * cannot reconstruct names or IPFS root CIDs; this is durable local metadata,
 * rather than a disposable RPC cache. Directory backups make it portable.
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
export const setCachedPieces = (walletAddress: string, pieces: DatasetPiece[]): boolean => {
  try {
    localStorage.setItem(getPieceCacheKey(walletAddress), JSON.stringify(pieces))
    return true
  } catch (error) {
    console.warn('[PieceCache] Failed to write piece cache to localStorage:', error)
    return false
  }
}

/** Prepend a piece to the cached list (used after an upload completes). Idempotent by file record ID. */
export const addCachedPiece = (walletAddress: string, piece: DatasetPiece): boolean => {
  const current = getCachedPieces(walletAddress) ?? []
  return setCachedPieces(walletAddress, [piece, ...current.filter((record) => record.id !== piece.id)])
}

/** Remove the cached piece list. Called alongside clearStoredDataSetIds so cache and ids stay in lockstep. */
export const clearCachedPieces = (walletAddress: string): void => {
  try {
    localStorage.removeItem(getPieceCacheKey(walletAddress))
  } catch (error) {
    console.warn('[PieceCache] Failed to clear piece cache from localStorage:', error)
  }
}
