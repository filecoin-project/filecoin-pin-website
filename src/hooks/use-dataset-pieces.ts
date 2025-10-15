import { METADATA_KEYS, PDPServer, WarmStorageService } from '@filoz/synapse-sdk'
import { useCallback, useContext, useEffect, useState } from 'react'
import { FilecoinPinContext } from '../context/filecoin-pin-provider.tsx'

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

export const useDatasetPieces = () => {
  const [pieces, setPieces] = useState<DatasetPiece[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const context = useContext(FilecoinPinContext)
  if (!context) {
    throw new Error('useDatasetPieces must be used within FilecoinPinProvider')
  }

  const { storageContext, providerInfo, wallet, synapse } = context

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
      return
    }

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

      /***
       * The below warmStorage and pdp server stuff should be migrated into nice API provided by filecoin-pin at some point.
       * There are PRs in flight to synapse-sdk for things related to this.
       */
      // Create the warm storage service
      const warmStorage = await WarmStorageService.create(synapse.getProvider(), synapse.getWarmStorageAddress())

      // Query the PDP server for the dataset and its pieces
      const pdpServer = new PDPServer(null, serviceURL)
      console.debug('[DatasetPieces] Fetching pieces for dataSetId:', storageContext.dataSetId)
      const dataSetData = await pdpServer.getDataSet(storageContext.dataSetId)

      console.debug(
        '[DatasetPieces] Found',
        dataSetData.pieces.length,
        'pieces in dataset id: ',
        storageContext.dataSetId
      )

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
            console.debug(
              '[DatasetPieces] Fetching metadata for piece:',
              pieceId,
              'from dataset:',
              storageContext.dataSetId
            )
            const metadata = await warmStorage.getPieceMetadata(storageContext.dataSetId, pieceId)

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
              datasetId: String(storageContext.dataSetId),
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
              datasetId: String(storageContext.dataSetId),
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
    }
  }, [storageContext, providerInfo, wallet, synapse])

  // Load pieces when storage context is ready
  useEffect(() => {
    if (storageContext && providerInfo) {
      loadPieces()
    } else {
      setPieces([])
    }
  }, [loadPieces])

  const refreshPieces = useCallback(() => {
    loadPieces()
  }, [loadPieces])

  return {
    pieces,
    isLoading,
    error,
    refreshPieces,
  }
}
