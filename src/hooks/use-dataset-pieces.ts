import { useCallback, useEffect, useRef, useState } from 'react'
import { useBrowserWallet } from '../context/browser-wallet-provider.tsx'
import { loadDriveFiles, mergeIndexedFiles } from '../lib/filecoin-pin/drive-api.ts'
import { recoverMissingFileSizes } from '../lib/filecoin-pin/file-size.ts'
import type { UploadCheckpoint } from '../lib/filecoin-pin/upload-checkpoint.ts'
import { addStoredDataSetId } from '../lib/local-storage/data-set.ts'
import { DIRECTORY_SAVE_ERROR } from '../lib/local-storage/directory-store.ts'
import {
  addCachedPiece,
  getCachedPieces,
  hasUnsavedPieces,
  mutateCachedPieces,
  subscribeCachedPieces,
} from '../lib/local-storage/piece-cache.ts'
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
  uploadedAt: number // Local upload start, or indexed storage-confirmation time.
  indexedAtBlock?: string
  pieceId?: number
  upload?: UploadCheckpoint
  removedCopies?: string[]
  removalQueuedCopies?: string[]
  /** Original CAR bytes are downloaded directly instead of unpacking a UnixFS file. */
  importedCar?: boolean
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

export type DirectoryPiecePatch = Partial<Pick<DatasetPiece, 'ipfsCheckAttempts'>>
export type PieceMutation = (current: DatasetPiece[]) => DatasetPiece[]

/** Show cached records immediately, then merge the wallet’s indexed Drive files. */
export const useDatasetPieces = () => {
  const [pieces, setPieces] = useState<DatasetPiece[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  const { synapse, storageScope, addDataSetId } = useFilecoinPinContext()
  const connection = useBrowserWallet()

  const walletAddress = storageScope ?? null
  const owner = connection.address
  const network = connection.network
  const currentScope = useRef(walletAddress)
  const autoLoadedRef = useRef(false)
  currentScope.current = walletAddress
  const recovery = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      recovery.current?.abort()
    }
  }, [])

  const commit = useCallback(
    async (operation: () => Promise<DatasetPiece[]>) => {
      if (!walletAddress) throw new Error('Connect a wallet before updating the directory.')
      try {
        await operation()
        if (mounted.current && currentScope.current === walletAddress) {
          setPieces(getCachedPieces(walletAddress) ?? [])
          setError(null)
        }
      } catch (cause) {
        if (mounted.current && currentScope.current === walletAddress) {
          // Failed checkpoints remain in memory for a later save retry.
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
    recovery.current?.abort()
    autoLoadedRef.current = false
    setHasLoaded(false)
    setError(null)
    setIndexError(null)
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

  const loadPieces = useCallback(async () => {
    if (!synapse || !owner || !walletAddress) return
    recovery.current?.abort()
    const controller = new AbortController()
    recovery.current = controller
    setIsLoading(true)
    setError(null)
    setIndexError(null)
    try {
      let indexed: DatasetPiece[]
      try {
        indexed = await loadDriveFiles(synapse, owner, network, controller.signal)
      } catch (cause) {
        if (!controller.signal.aborted && mounted.current && currentScope.current === walletAddress)
          setIndexError(cause instanceof Error ? cause.message : 'Unable to load the Filecoin index.')
        return
      }
      controller.signal.throwIfAborted()
      if (!mounted.current || currentScope.current !== walletAddress) return
      await mutatePieces((current) => mergeIndexedFiles(current, indexed))
      for (const id of new Set(indexed.map((file) => file.datasetId))) {
        addStoredDataSetId(walletAddress, Number(id))
        addDataSetId?.(BigInt(id))
      }
      void recoverMissingFileSizes(getLatestPieces(), controller.signal, async (file, fileSize) => {
        if (controller.signal.aborted || !mounted.current || currentScope.current !== walletAddress) return
        await mutatePieces((current) =>
          current.map((record) =>
            record.cid === file.cid && !record.importedCar && record.fileSize === 'Unknown'
              ? { ...record, fileSize }
              : record
          )
        )
      })
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current && currentScope.current === walletAddress)
        setError(cause instanceof Error ? cause.message : 'Unable to update the browser directory.')
    } finally {
      if (!controller.signal.aborted && mounted.current && currentScope.current === walletAddress) {
        setIsLoading(false)
        setHasLoaded(true)
      }
    }
  }, [synapse, owner, network, walletAddress, mutatePieces, addDataSetId, getLatestPieces])

  useEffect(() => {
    if (!walletAddress || !synapse || !owner || autoLoadedRef.current) return
    autoLoadedRef.current = true
    setPieces(getCachedPieces(walletAddress) ?? [])
    void loadPieces()
  }, [walletAddress, synapse, owner, loadPieces])

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
      commit(() =>
        mutateCachedPieces(
          walletAddress ?? '',
          (current) => current.map((file) => (file.id === id ? { ...file, ...patch } : file)),
          { retainOnFailure: false }
        )
      ),
    [commit, walletAddress]
  )

  return {
    updatePiece,
    mutatePieces,
    getLatestPieces,
    pieces,
    hasUnsavedChanges: walletAddress ? hasUnsavedPieces(walletAddress) : false,
    isLoading,
    error,
    indexError,
    refreshPieces,
    addPiece,
    hasLoaded,
  }
}
