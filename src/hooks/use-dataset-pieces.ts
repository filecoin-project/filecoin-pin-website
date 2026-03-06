import { getDetailedDataSet } from 'filecoin-pin/core/data-set'
import { useCallback, useEffect, useState } from 'react'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'

// Inlined from @filoz/synapse-sdk METADATA_KEYS to avoid dual-copy type issues
const IPFS_ROOT_CID_KEY = 'ipfsRootCID'

export interface DatasetPiece {
  id: string
  fileName: string
  fileSize: string
  cid: string
  pieceCid: string
  providerName: string
  datasetId: string
  providerId: string
  serviceURL: string
  transactionHash: string
  network: string
  uploadedAt: number // timestamp
  pieceId: number
  copyCount?: number
  datasetIds?: string[]
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

  const dataSetId = dataSet.status === 'ready' ? dataSet.dataSetId : null

  const loadPieces = useCallback(async () => {
    if (!synapse || dataSetId == null) {
      console.debug('[DatasetPieces] Missing dependencies - synapse:', !!synapse, 'dataSetId:', dataSetId)
      setPieces([])
      setHasLoaded(false)
      return
    }

    setHasLoaded(false)
    setIsLoading(true)
    setError(null)

    try {
      console.debug('[DatasetPieces] Loading pieces from dataset:', String(dataSetId))

      const dataSetData = await getDetailedDataSet(synapse, dataSetId)
      if (typeof dataSetData.pieces === 'undefined') {
        throw new Error('[DatasetPieces] Pieces data unavailable')
      }

      console.debug('[DatasetPieces] Found', dataSetData.pieces.length, 'pieces in dataset id:', String(dataSetId))

      if (dataSetData.pieces.length === 0) {
        setPieces([])
        return
      }

      const provider = dataSetData.provider

      const piecesWithMetadata: DatasetPiece[] = await Promise.all(
        dataSetData.pieces.map(async (piece) => {
          try {
            const pieceId = piece.pieceId
            const pieceCid = piece.pieceCid.toString()

            if (typeof piece.metadata === 'undefined') {
              throw new Error('[DatasetPiece] Piece metadata unavailable')
            }

            const ipfsRootCid = piece.metadata[IPFS_ROOT_CID_KEY] || ''
            const fileName = piece.metadata.label || ipfsRootCid || `unknown`
            const fileSize = piece.metadata.fileSize || 'Unknown'

            return {
              id: `piece-${pieceId}`,
              fileName,
              fileSize,
              cid: ipfsRootCid,
              pieceCid,
              providerName: provider?.name || 'unknown',
              datasetId: String(dataSetId),
              providerId: provider ? String(provider.id) : '',
              serviceURL: provider?.pdp?.serviceURL ?? '',
              network: wallet?.status === 'ready' ? wallet.data.network : 'calibration',
              uploadedAt: piece.metadata.uploadedAt ? Number(piece.metadata.uploadedAt) : Date.now(),
              pieceId: Number(pieceId),
              transactionHash: piece.metadata.transactionHash || '',
            }
          } catch (err) {
            console.warn(err)
            return {
              id: `piece-${piece.pieceId}`,
              fileName: `Piece ${piece.pieceId}`,
              fileSize: 'Unknown',
              cid: '',
              pieceCid: piece.pieceCid.toString(),
              providerName: provider?.name || 'unknown',
              datasetId: String(dataSetId),
              providerId: provider ? String(provider.id) : '',
              serviceURL: provider?.pdp?.serviceURL ?? '',
              network: wallet?.status === 'ready' ? wallet.data.network : 'calibration',
              uploadedAt: Date.now(),
              pieceId: Number(piece.pieceId),
              transactionHash: '',
            }
          }
        })
      )

      piecesWithMetadata.sort((a, b) => (b.pieceId || 0) - (a.pieceId || 0))

      setPieces(piecesWithMetadata)
    } catch (err) {
      console.error('[DatasetPieces] Failed to load pieces:', err)
      setError(err instanceof Error ? err.message : 'Failed to load pieces')
      setPieces([])
    } finally {
      setIsLoading(false)
      setHasLoaded(true)
    }
  }, [dataSetId, wallet, synapse])

  useEffect(() => {
    if (synapse && dataSetId != null) {
      loadPieces()
    } else {
      setPieces([])
      setHasLoaded(false)
    }
  }, [loadPieces])

  const refreshPieces = useCallback(() => {
    loadPieces()
  }, [loadPieces])

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
