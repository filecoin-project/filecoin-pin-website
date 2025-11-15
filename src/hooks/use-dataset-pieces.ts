import { METADATA_KEYS, PDPServer } from '@filoz/synapse-sdk'
import { useCallback, useEffect, useState } from 'react'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'

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
}

/**
 * Fetches and normalizes dataset pieces for the active wallet/provider combo.
 *
 * Abstracts away Synapse warm storage + PDP interactions so UI components
 * simply call this hook and render the returned list.
 */
export const useDatasetPieces = () => {
  const [pieces, setPieces] = useState<DatasetPiece[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  const { storageContext, providerInfo, wallet, synapse } = useFilecoinPinContext()

  const dataSetId = storageContext?.dataSetId

  const loadPieces = useCallback(async () => {
    if (!storageContext || !providerInfo || !synapse) {
      console.debug(
        '[DatasetPieces] Missing dependencies - storageContext:',
        !!storageContext,
        'providerInfo:',
        !!providerInfo,
        'synapse:',
        !!synapse
      )
      setPieces([])
      setHasLoaded(false)
      return
    }

    setHasLoaded(false)
    setIsLoading(true)
    setError(null)

    try {
      console.debug('[DatasetPieces] Loading pieces from dataset:', storageContext.dataSetId)
      console.debug('[DatasetPieces] Wallet address:', wallet?.status === 'ready' ? wallet.data.address : 'not ready')

      // Get the PDP service URL from the provider
      const serviceURL = providerInfo.products?.PDP?.data?.serviceURL
      if (!serviceURL) {
        console.warn('[DatasetPieces] Provider does not expose a PDP service URL')
        setPieces([])
        return
      }
      if (!dataSetId) {
        console.warn('[DatasetPieces] Storage context does not have a data set ID')
        setPieces([])
        return
      }

      /***
       * The below warmStorage and pdp server stuff should be migrated into nice API provided by filecoin-pin at some point.
       * There are PRs in flight to synapse-sdk for things related to this.
       */
      // Create the warm storage service
      // @ts-expect-error - Accessing private _warmStorageService temporarily until SDK is updated
      const warmStorage = synapse.storage._warmStorageService
      if (!warmStorage) {
        throw new Error('[DatasetPieces] Synapse warm storage service is unavailable')
      }

      // Query the PDP server for the dataset and its pieces
      const pdpServer = new PDPServer(null, serviceURL)
      console.debug('[DatasetPieces] Fetching pieces for dataSetId:', dataSetId)
      const dataSetData = await pdpServer.getDataSet(dataSetId)

      console.debug('[DatasetPieces] Found', dataSetData.pieces.length, 'pieces in dataset id: ', dataSetId)

      if (dataSetData.pieces.length === 0) {
        setPieces([])
        return
      }

      // For each piece, fetch its metadata
      const piecesWithMetadata: DatasetPiece[] = await Promise.all(
        dataSetData.pieces.map(async (piece) => {
          try {
            const pieceId = piece.pieceId
            const pieceCid = piece.pieceCid.toString()

            // Fetch metadata for this piece
            console.debug('[DatasetPieces] Fetching metadata for piece:', pieceId, 'from dataset:', dataSetId)
            const metadata = await warmStorage.getPieceMetadata(dataSetId, pieceId)

            // Extract relevant metadata
            const ipfsRootCid = metadata[METADATA_KEYS.IPFS_ROOT_CID] || ''
            const fileName = metadata.label || ipfsRootCid || `unknown`
            const fileSize = metadata.fileSize || 'Unknown'

            return {
              id: `piece-${pieceId}`,
              fileName,
              fileSize,
              cid: ipfsRootCid,
              pieceCid,
              providerName: providerInfo.name || 'unknown',
              datasetId: String(dataSetId),
              providerId: providerInfo.id.toString(),
              serviceURL: providerInfo.products?.PDP?.data?.serviceURL ?? '',
              network: wallet?.status === 'ready' ? wallet.data.network : 'calibration',
              uploadedAt: metadata.uploadedAt ? Number(metadata.uploadedAt) : Date.now(),
              pieceId,
              transactionHash: metadata.transactionHash || '',
            }
          } catch (err) {
            console.warn('[DatasetPieces] Failed to fetch metadata for piece:', piece.pieceId, err)
            // Return minimal data
            return {
              id: `piece-${piece.pieceId}`,
              fileName: `Piece ${piece.pieceId}`,
              fileSize: 'Unknown',
              cid: '',
              pieceCid: piece.pieceCid.toString(),
              providerName: providerInfo.name || 'unknown',
              datasetId: String(dataSetId),
              providerId: providerInfo.id.toString(),
              serviceURL: providerInfo.products?.PDP?.data?.serviceURL ?? '',
              network: wallet?.status === 'ready' ? wallet.data.network : 'calibration',
              uploadedAt: Date.now(),
              pieceId: piece.pieceId,
              transactionHash: '',
            }
          }
        })
      )

      // Sort by piece ID (newest first, assuming higher IDs are newer)
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
  }, [dataSetId, providerInfo, wallet, synapse])

  // Load pieces when storage context is ready
  useEffect(() => {
    if (storageContext && providerInfo) {
      loadPieces()
    } else {
      setPieces([])
      setHasLoaded(false)
    }
  }, [loadPieces])

  const refreshPieces = useCallback(() => {
    loadPieces()
  }, [loadPieces])

  /**
   * Add a new piece to the history without refetching from backend.
   * This is used when an upload completes and we already have all the data.
   */
  const addPiece = useCallback((piece: DatasetPiece) => {
    setPieces((prev) => {
      // Add new piece at the beginning (newest first)
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
