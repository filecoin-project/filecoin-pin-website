import { getDetailedDataSet } from 'filecoin-pin/core/data-set'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'

// Inlined from @filoz/synapse-sdk METADATA_KEYS to avoid dual-copy type issues
const IPFS_ROOT_CID_KEY = 'ipfsRootCID'

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

/**
 * Fetches and normalizes dataset pieces for the active wallet.
 *
 * Uses getDetailedDataSet which only needs Synapse + dataSetId.
 */
export const useDatasetPieces = () => {
  const [pieces, setPieces] = useState<DatasetPiece[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  const { wallet, synapse, dataSet } = useFilecoinPinContext()

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

      const network = wallet?.status === 'ready' ? wallet.data.network : 'calibration'
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
          const meta = piece.metadata ?? {}
          const ipfsRootCid = meta[IPFS_ROOT_CID_KEY] || ''
          const fileName = meta.label || ipfsRootCid || 'unknown'
          const fileSize = meta.fileSize || 'Unknown'
          const transactionHash = meta.transactionHash || ''
          const uploadedAt = meta.uploadedAt ? Number(meta.uploadedAt) : Date.now()
          const pieceId = Number(piece.pieceId)

          const existing = piecesByCid.get(pieceCid)
          if (existing) {
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

      const merged = [...piecesByCid.values()]
      merged.sort((a, b) => (b.pieceId || 0) - (a.pieceId || 0))

      console.debug('[DatasetPieces] Merged', merged.length, 'unique pieces across', dataSetIds.length, 'datasets')
      setPieces(merged)
    } catch (err) {
      console.error('[DatasetPieces] Failed to load pieces:', err)
      setError(err instanceof Error ? err.message : 'Failed to load pieces')
      setPieces([])
    } finally {
      setIsLoading(false)
      setHasLoaded(true)
    }
  }, [dataSetIds, wallet, synapse])

  useEffect(() => {
    if (synapse && dataSetIds.length > 0) {
      loadPieces()
    } else {
      setPieces([])
      setHasLoaded(false)
    }
  }, [loadPieces, synapse, dataSetIds.length])

  const refreshPieces = useCallback(() => {
    loadPieces()
  }, [loadPieces])

  /** Add a piece to the history without refetching from backend (used after upload completes). */
  const addPiece = useCallback((piece: DatasetPiece) => {
    setPieces((prev) => {
      const updated = [piece, ...prev]
      return updated
    })
  }, [])

  return {
    pieces,
    isLoading,
    error,
    refreshPieces,
    addPiece,
    hasLoaded,
  }
}
