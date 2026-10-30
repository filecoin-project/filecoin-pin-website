import { calibration, mainnet } from '@filoz/synapse-core/chains'
import { getScheduledRemovals } from '@filoz/synapse-core/pdp-verifier'
import { from as pieceFrom } from '@filoz/synapse-core/piece'
import { epochToDate } from '@filoz/synapse-core/utils'
import type { Synapse } from '@filoz/synapse-sdk'
import { CID } from 'multiformats/cid'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { isCopyRemovalScheduled, isDeletionScheduled } from '../../utils/file-deletion.ts'
import { formatFileSize } from '../../utils/format-file-size.ts'
import { normalizeFolder } from '../local-storage/drive-directory.ts'
import { mergeStorageCopies, storageInstances } from '../local-storage/piece-cache.ts'
import { APPLICATION_SOURCE } from './synapse.ts'

const API = 'https://api.filecoin.io'
type DataSet = { dataSetId: string; providerId: string; owner: string; source: string | null; deleted: boolean }
type Piece = {
  dataSetId: string
  pieceId: string
  cid: string
  removed: boolean
  metadata: Record<string, unknown> | null
  rawSize?: string | null
  addedAtBlock?: string | null
}
type Provider = { name: string | null; serviceUrl: string | null }

async function request(path: string, signal: AbortSignal) {
  const response = await fetch(`${API}${path}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) })
  if (!response.ok) throw new Error(`Filecoin index unavailable (${response.status}). Please try loading again.`)
  return response.json()
}

async function pages<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const result: T[] = []
  const seen = new Set<string>()
  let cursor: string | null = null
  do {
    const query = new URLSearchParams({ limit: '200', ...(cursor ? { cursor } : {}) })
    const page = await request(`${path}${path.includes('?') ? '&' : '?'}${query}`, signal)
    if (!Array.isArray(page.data) || !(page.nextCursor === null || typeof page.nextCursor === 'string'))
      throw new Error('Invalid file index response. Your cached files are kept.')
    result.push(...page.data)
    cursor = page.nextCursor
    if (cursor && seen.has(cursor)) throw new Error('The file index returned a repeated page cursor.')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return result
}

function decimal(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
}

/** Discover by wallet, not by browser clientId. Metadata is uploader-declared indexer data. */
export async function loadDriveFiles(synapse: Synapse, owner: string, network: string, signal: AbortSignal) {
  if (network !== 'mainnet' && network !== 'calibration') throw new Error('Unsupported file index network.')
  const datasets = await pages<DataSet>(`/${network}/data-sets?owner=${encodeURIComponent(owner)}`, signal)
  const providers = new Map<string, Provider>()
  const files: DatasetPiece[] = []
  // Bound request concurrency and paginate every dataset before committing the snapshot.
  for (const dataset of datasets) {
    signal.throwIfAborted()
    if (
      dataset.source !== APPLICATION_SOURCE ||
      typeof dataset.deleted !== 'boolean' ||
      dataset.owner?.toLowerCase() !== owner.toLowerCase()
    )
      continue
    if (!decimal(dataset.dataSetId) || !decimal(dataset.providerId)) throw new Error('Invalid indexed dataset.')
    const pieces = await pages<Piece>(`/${network}/data-sets/${dataset.dataSetId}/pieces`, signal)
    // The index has no scheduled-removal field. Check it before recovering visible records.
    const queued = new Set(
      dataset.deleted
        ? []
        : (await getScheduledRemovals(synapse.readClient, { dataSetId: BigInt(dataset.dataSetId) })).map(String)
    )
    signal.throwIfAborted()
    let provider = providers.get(dataset.providerId)
    if (!provider) {
      provider = (await request(`/${network}/providers/${dataset.providerId}`, signal)).data as Provider
      if (!provider || (provider.serviceUrl && !/^https?:\/\//.test(provider.serviceUrl)))
        throw new Error('Invalid indexed provider.')
      providers.set(dataset.providerId, provider)
    }
    for (const piece of pieces) {
      if (piece.dataSetId !== dataset.dataSetId || !decimal(piece.pieceId) || typeof piece.removed !== 'boolean')
        throw new Error('Invalid indexed piece.')
      pieceFrom(piece.cid)
      const metadata = piece.metadata ?? {}
      let cid = ''
      try {
        if (typeof metadata.ipfsRootCID === 'string') cid = CID.parse(metadata.ipfsRootCID).toString()
      } catch {
        /* Missing metadata does not hide stored content. */
      }
      const fileName = typeof metadata.label === 'string' && metadata.label.trim() ? metadata.label : ''
      let folderPath = ''
      try {
        const path = metadata.path ?? metadata.carPath
        if (typeof path === 'string') folderPath = normalizeFolder(path)
      } catch {
        /* Legacy records without a valid path belong at the root. */
      }
      files.push({
        id: `indexed-${dataset.dataSetId}-${piece.pieceId}`,
        fileName,
        folderPath,
        importedCar: typeof metadata.carPath === 'string' || undefined,
        fileSize:
          typeof metadata.carPath === 'string' && decimal(piece.rawSize)
            ? formatFileSize(Number(piece.rawSize))
            : 'Unknown',
        cid,
        pieceCid: piece.cid,
        providerName: provider.name ?? '',
        providerId: dataset.providerId,
        serviceURL: provider.serviceUrl ?? '',
        datasetId: dataset.dataSetId,
        pieceId: Number(piece.pieceId),
        transactionHash: '',
        network,
        uploadedAt: decimal(piece.addedAtBlock)
          ? epochToDate(
              Number(piece.addedAtBlock),
              (network === 'mainnet' ? mainnet : calibration).genesisTimestamp
            ).getTime()
          : 0,
        indexedAtBlock: decimal(piece.addedAtBlock) ? piece.addedAtBlock : undefined,
        copyCount: 1,
        removedCopies: piece.removed || dataset.deleted ? [dataset.dataSetId] : [],
        removalQueuedCopies: queued.has(piece.pieceId) ? [dataset.dataSetId] : [],
      })
    }
  }
  return files
}

/** Merge by actual storage instance, never discard local records absent from a lagging index. */
function mergeFiles(local: DatasetPiece[], indexed: DatasetPiece[]): DatasetPiece[] {
  const result = [...local]
  const superseded = new Set<string>()
  for (const incoming of indexed) {
    const identities = new Set(storageInstances(incoming))
    let matches = result.flatMap((file, i) =>
      file.pieceCid === incoming.pieceCid && storageInstances(file).some((identity) => identities.has(identity))
        ? [i]
        : []
    )
    if (!matches.length) {
      // A parked upload has no dataset/piece identity yet. Recover only a unique
      // matching upload from this provider, added after the local task started.
      const pending = result.flatMap((file, i) =>
        file.upload &&
        file.upload.phase !== 'complete' &&
        file.cid === incoming.cid &&
        file.fileName === incoming.fileName &&
        (file.folderPath ?? '') === (incoming.folderPath ?? '') &&
        Boolean(file.importedCar) === Boolean(incoming.importedCar) &&
        incoming.uploadedAt >= file.uploadedAt &&
        file.upload.providers.some(
          (provider) =>
            provider.providerId === incoming.providerId &&
            (!provider.dataSetId || provider.dataSetId === incoming.datasetId)
        )
          ? [i]
          : []
      )
      if (pending.length === 1) matches = pending
    }
    if (!matches.length) {
      // Pair replicas without collapsing repeated uploads in the same dataset.
      const i = result.findIndex(
        (file) =>
          file.id.startsWith('indexed-') &&
          file.pieceCid === incoming.pieceCid &&
          file.fileName === incoming.fileName &&
          file.folderPath === incoming.folderPath &&
          Boolean(file.importedCar) === Boolean(incoming.importedCar) &&
          isDeletionScheduled(file) === isDeletionScheduled(incoming) &&
          !(file.datasetIds ?? [file.datasetId]).includes(incoming.datasetId)
      )
      if (i >= 0) matches = [i]
    }
    if (!matches.length) {
      result.push(incoming)
      continue
    }
    if (matches.some((i) => !result[i].id.startsWith('indexed-')))
      for (const i of matches) if (result[i].id.startsWith('indexed-')) superseded.add(result[i].id)
    for (const i of matches) {
      const previous = result[i]
      const merged = mergeStorageCopies(previous, incoming)
      const upload = previous.upload
      const providers = upload?.providers.map((provider) => {
        const index = (incoming.datasetIds ?? [incoming.datasetId]).findIndex(
          (id, i) =>
            (incoming.providerIds?.[i] ?? incoming.providerId) === provider.providerId &&
            (!provider.dataSetId || provider.dataSetId === id)
        )
        if (index < 0) return provider
        return {
          ...provider,
          confirmed: true,
          dataSetId: (incoming.datasetIds ?? [incoming.datasetId])[index],
          pieceId: incoming.pieceIds?.[index] ?? String(incoming.pieceId),
        }
      })
      result[i] = {
        ...merged,
        ...(upload && providers
          ? {
              upload: {
                ...upload,
                providers,
                phase: providers.every((provider) => provider.confirmed || provider.rejected)
                  ? ('complete' as const)
                  : upload.phase,
                error: providers.every((provider) => provider.confirmed || provider.rejected)
                  ? undefined
                  : upload.error,
              },
            }
          : {}),
        fileName: previous.fileName && previous.fileName !== 'unknown' ? previous.fileName : incoming.fileName,
        cid: previous.cid || incoming.cid,
        fileSize: previous.fileSize === 'Unknown' ? incoming.fileSize : previous.fileSize,
        uploadedAt: previous.uploadedAt || incoming.uploadedAt,
        removedCopies: [...new Set([...(previous.removedCopies ?? []), ...(incoming.removedCopies ?? [])])],
        removalQueuedCopies: [
          ...new Set([...(previous.removalQueuedCopies ?? []), ...(incoming.removalQueuedCopies ?? [])]),
        ],
      }
    }
  }
  return result.filter((file) => !superseded.has(file.id))
}

export function mergeIndexedFiles(local: DatasetPiece[], indexed: DatasetPiece[]): DatasetPiece[] {
  // Pair remote replicas first so a locally saved partial upload gains its other
  // indexed copy even when the local primary is not first in the API response.
  const acknowledged = indexed.map((file) => {
    const identity = storageInstances(file)[0]
    const knownRemoval = local.some(
      (record) =>
        record.pieceCid === file.pieceCid &&
        storageInstances(record).includes(identity) &&
        isCopyRemovalScheduled(record, file.datasetId)
    )
    return knownRemoval ? { ...file, removalQueuedCopies: [file.datasetId] } : file
  })
  return mergeFiles(local, mergeFiles([], acknowledged))
}

export const displayFileName = (file: DatasetPiece) =>
  file.fileName && file.fileName !== 'unknown' ? file.fileName : file.cid || file.pieceCid
