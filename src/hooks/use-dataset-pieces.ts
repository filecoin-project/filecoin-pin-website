import { getDetailedDataSet } from 'filecoin-pin/core/data-set'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DIRECTORY_SAVE_ERROR } from '../lib/local-storage/directory-store.ts'
import {
  addCachedPiece,
  getCachedPieces,
  hasUnsavedPieces,
  mergeStorageCopies,
  mutateCachedPieces,
  subscribeCachedPieces,
} from '../lib/local-storage/piece-cache.ts'
import { isDeletionScheduled } from '../utils/file-deletion.ts'
import { formatFileSize } from '../utils/format-file-size.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'
import { useIpfsIndexing } from './use-ipfs-indexing.ts'

export interface DatasetPiece {
  id: string
  fileName: string
  fileSize: string
  cid: string
  pieceCid: string
  /** Primary provider name. */
  providerName: string
  /** Primary dataset id. */
  datasetId: string
  /** Primary provider id. */
  providerId: string
  /** Primary provider service URL. */
  serviceURL: string
  /** Primary transaction hash. */
  transactionHash: string
  network: string
  uploadedAt: number // timestamp
  pieceId: number
  folderPath?: string
  ipfsIndexed?: boolean
  ipfsCheckAttempts?: number
  pieceIds?: string[]
  deletion?: Record<string, { transactionHash: string; confirmed: boolean; remaining?: boolean }>
  /** Total copies (1 for un-replicated). */
  copyCount?: number
  /** Datasets that hold a copy of this piece (primary first). */
  datasetIds?: string[]
  /** Provider ids per copy (primary first). */
  providerIds?: string[]
  /** Provider names per copy (primary first). */
  providerNames?: string[]
  /** Provider service URLs per copy (primary first). */
  serviceURLs?: string[]
  /** Per-copy piece-add transaction hashes. */
  transactionHashes?: string[]
}

export type DirectoryPiecePatch = Partial<Pick<DatasetPiece, 'fileName' | 'folderPath' | 'ipfsCheckAttempts'>>
export type PieceMutation = (current: DatasetPiece[]) => DatasetPiece[]

/**
 * Fetches and normalizes dataset pieces for the active wallet.
 *
 * Renders from the localStorage piece cache when available (zero RPC calls);
 * only falls back to chain enumeration (getDetailedDataSet) when no cache
 * exists or the caller explicitly refreshes. Chain enumeration is expensive
 * (several eth_calls per dataset) and, since filecoin-pin no longer exposes
 * per-piece metadata on chain, can't recover the original filename or IPFS
 * CID — those render as placeholders for pieces found this way.
 */
export const useDatasetPieces = () => {
  const [pieces, setPieces] = useState<DatasetPiece[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  const { wallet, synapse, dataSet, storageScope } = useFilecoinPinContext()

  const walletAddress = storageScope ?? (wallet.status === 'ready' ? wallet.data.address : null)
  const network = wallet.status === 'ready' ? wallet.data.network : 'calibration'
  const currentScope = useRef(walletAddress)
  const autoLoadedRef = useRef(false)
  currentScope.current = walletAddress
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const commit = useCallback(
    async (operation: () => Promise<DatasetPiece[]>) => {
      if (!walletAddress) throw new Error('Connect a wallet before updating the directory.')
      try {
        await operation()
        if (mounted.current && currentScope.current === walletAddress) {
          setPieces(getCachedPieces(walletAddress) ?? [])
          setHasLoaded(true)
          setError(null)
        }
      } catch (cause) {
        if (mounted.current && currentScope.current === walletAddress) {
          // Failed writes retain their semantic mutations for export and a later save retry.
          setPieces(getCachedPieces(walletAddress) ?? [])
          setError(cause instanceof Error ? cause.message : 'Unable to update the browser directory.')
        }
        throw cause
      }
    },
    [walletAddress]
  )

  const mutatePieces = useCallback(
    (update: PieceMutation) => commit(() => mutateCachedPieces(walletAddress ?? '', update)),
    [commit, walletAddress]
  )

  const getLatestPieces = useCallback(
    () => (walletAddress ? (getCachedPieces(walletAddress) ?? []) : []),
    [walletAddress]
  )

  useEffect(() => {
    autoLoadedRef.current = false
    setHasLoaded(false)
    setError(null)
    if (!walletAddress) {
      setPieces([])
      return
    }
    const sync = () => {
      setPieces(getCachedPieces(walletAddress) ?? [])
      if (hasUnsavedPieces(walletAddress)) setError(DIRECTORY_SAVE_ERROR)
    }
    const unsubscribe = subscribeCachedPieces(walletAddress, sync)
    sync()
    return unsubscribe
  }, [walletAddress])

  const dataSetIdsKey = dataSet.status === 'ready' ? dataSet.dataSetIds.map((id) => String(id)).join(',') : ''
  const dataSetIds = useMemo<bigint[]>(
    () => (dataSetIdsKey ? dataSetIdsKey.split(',').map((s) => BigInt(s)) : []),
    [dataSetIdsKey]
  )

  const loadPieces = useCallback(async () => {
    if (!synapse || dataSetIds.length === 0) {
      console.debug('[DatasetPieces] Missing dependencies - synapse:', !!synapse, 'dataSetIds:', dataSetIds.length)
      setPieces([])
      setHasLoaded(false)
      return
    }

    setHasLoaded(false)
    setIsLoading(true)
    setError(null)

    try {
      console.debug('[DatasetPieces] Loading pieces from datasets:', dataSetIds.map(String).join(','))

      const datasets = await Promise.all(
        dataSetIds.map(async (id) => {
          try {
            const data = await getDetailedDataSet(synapse, id)
            return { id, data }
          } catch (err) {
            console.warn('[DatasetPieces] Failed to load dataset', String(id), err)
            return null
          }
        })
      )

      // Group by pieceCid so the same piece replicated across N datasets renders as one entry
      const piecesByCid = new Map<string, DatasetPiece>()

      for (const entry of datasets) {
        if (!entry?.data) continue
        const pieces = entry.data.pieces
        if (!pieces) continue
        const { id: dsId, data: dataSetData } = entry
        const provider = dataSetData.provider
        const dsIdStr = String(dsId)
        const providerName = provider?.name || 'unknown'
        const providerId = provider ? String(provider.id) : ''
        const serviceURL = provider?.pdp?.serviceURL ?? ''

        for (const piece of pieces) {
          const pieceCid = piece.pieceCid.toString()
          // filecoin-pin no longer exposes per-piece metadata (label/ipfsRootCID), so
          // this chain-enumeration fallback can't recover the original filename or IPFS
          // CID for pieces missing from the local cache. Size is still available directly.
          const ipfsRootCid = ''
          const fileName = 'unknown'
          const fileSize = piece.size == null ? 'Unknown' : formatFileSize(piece.size)
          const transactionHash = ''
          const uploadedAt = Date.now()
          const pieceId = Number(piece.pieceId)

          const existing = piecesByCid.get(pieceCid)
          if (existing) {
            if (existing.datasetIds?.includes(dsIdStr)) continue
            // Append this dataset/copy info; keep the primary (first seen) as the primary fields
            existing.datasetIds = [...(existing.datasetIds ?? []), dsIdStr]
            existing.providerIds = [...(existing.providerIds ?? []), providerId]
            existing.providerNames = [...(existing.providerNames ?? []), providerName]
            existing.serviceURLs = [...(existing.serviceURLs ?? []), serviceURL]
            existing.transactionHashes = [...(existing.transactionHashes ?? []), transactionHash]
            existing.copyCount = (existing.copyCount ?? 1) + 1
          } else {
            piecesByCid.set(pieceCid, {
              id: `piece-${pieceCid}`,
              fileName,
              fileSize,
              cid: ipfsRootCid,
              pieceCid,
              providerName,
              datasetId: dsIdStr,
              providerId,
              serviceURL,
              transactionHash,
              network,
              uploadedAt,
              pieceId,
              copyCount: 1,
              datasetIds: [dsIdStr],
              providerIds: [providerId],
              providerNames: [providerName],
              serviceURLs: [serviceURL],
              transactionHashes: [transactionHash],
            })
          }
        }
      }

      // Chain reads update storage facts without overwriting the browser's names, paths or CIDs.
      const merge = (cached: DatasetPiece[]) => {
        const merged = cached.map((file) => {
          // Archived receipts describe the copies removed at that time, not future uploads.
          if (isDeletionScheduled(file)) return file
          const live = piecesByCid.get(file.pieceCid)
          if (!live) return file
          return mergeStorageCopies(file, live)
        })
        const known = new Set(cached.map((file) => file.pieceCid))
        merged.push(...[...piecesByCid.values()].filter((file) => !known.has(file.pieceCid)))
        return merged.sort((a, b) => (b.pieceId || 0) - (a.pieceId || 0))
      }
      // A failed dataset fetch yields a partial list; caching it would
      // silently drop those pieces from history on every later visit.
      const hadFailures = datasets.some((entry) => entry == null)
      if (walletAddress && !hadFailures) await mutatePieces(merge)
      else if (mounted.current && currentScope.current === walletAddress) setPieces(merge(getLatestPieces()))
    } catch (err) {
      console.error('[DatasetPieces] Failed to load pieces:', err)
      if (mounted.current && currentScope.current === walletAddress)
        setError(err instanceof Error ? err.message : 'Failed to load pieces')
    } finally {
      if (mounted.current && currentScope.current === walletAddress) {
        setIsLoading(false)
        setHasLoaded(true)
      }
    }
  }, [dataSetIds, network, walletAddress, synapse, mutatePieces, getLatestPieces])

  // Load history at most once per page visit: from the localStorage cache when
  // available (zero RPC calls), falling back to one chain enumeration when the
  // cache is missing (e.g. cleared storage). Deliberately NOT re-run when the
  // wallet object refreshes or when an upload appends a new dataset id —
  // uploads update history locally via addPiece.
  useEffect(() => {
    if (autoLoadedRef.current) return
    // Only arm once the dataset manager has settled. While it is idle/
    // initializing, dataSetIds is empty but not authoritative, so we must not
    // mark ourselves loaded yet.
    if (!walletAddress || dataSet.status !== 'ready') return
    // A wallet that genuinely owns no datasets: arm the guard and stop, so a
    // dataset id appended mid-upload (piecesConfirmed flips 0 -> 1 before the
    // piece cache is written) never triggers a chain enumeration.
    if (dataSetIds.length === 0) {
      autoLoadedRef.current = true
      setPieces(getCachedPieces(walletAddress) ?? [])
      setHasLoaded(true)
      return
    }

    const cached = getCachedPieces(walletAddress)
    if (cached) {
      autoLoadedRef.current = true
      console.debug('[DatasetPieces] Loaded', cached.length, 'pieces from cache (no RPC)')
      setPieces(cached)
      setHasLoaded(true)
      return
    }

    if (synapse) {
      autoLoadedRef.current = true
      loadPieces()
    }
  }, [walletAddress, dataSet.status, dataSetIds.length, synapse, loadPieces])

  const updateIndexing = useCallback(
    (cid: string, indexed: boolean, attempts: number) => {
      return mutatePieces((previous) =>
        previous.map((file) =>
          file.cid === cid && !file.deletion && (indexed || file.ipfsIndexed !== true)
            ? { ...file, ipfsIndexed: indexed, ipfsCheckAttempts: Math.max(file.ipfsCheckAttempts ?? 0, attempts) }
            : file
        )
      )
    },
    [mutatePieces]
  )
  useIpfsIndexing(walletAddress, pieces, updateIndexing)

  const refreshPieces = useCallback(() => {
    return loadPieces()
  }, [loadPieces])

  /** Add a piece to the history without refetching from backend (used after upload completes). */
  const addPiece = useCallback(
    (piece: DatasetPiece) => commit(() => addCachedPiece(walletAddress ?? '', piece)),
    [commit, walletAddress]
  )

  const updatePiece = useCallback(
    (id: string, patch: DirectoryPiecePatch) =>
      mutatePieces((current) => current.map((file) => (file.id === id ? { ...file, ...patch } : file))),
    [mutatePieces]
  )

  return {
    updatePiece,
    mutatePieces,
    getLatestPieces,
    pieces,
    hasUnsavedChanges: walletAddress ? hasUnsavedPieces(walletAddress) : false,
    isLoading,
    error,
    refreshPieces,
    addPiece,
    hasLoaded,
  }
}
