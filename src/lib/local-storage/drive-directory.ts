import { from as pieceFrom } from '@filoz/synapse-core/piece'
import { CID } from 'multiformats/cid'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { isDeletionScheduled } from '../../utils/file-deletion.ts'
import { createDirectoryStore } from './directory-store.ts'
import { readDirectoryPieces } from './piece-cache.ts'

const folderStore = createDirectoryStore<string[]>(
  (scope) => `filecoin-drive-folders-${scope}`,
  (raw) => {
    const values: unknown = JSON.parse(raw ?? '[]')
    if (!Array.isArray(values) || !values.every((value) => typeof value === 'string'))
      throw new Error('Invalid browser folder directory.')
    return directoryFolders([], values)
  }
)

export const subscribeFolders = folderStore.subscribe

export function normalizeFolder(path: string): string {
  const parts = path.replaceAll('\\', '/').split('/').filter(Boolean)
  if (
    parts.some((part) => part === '.' || part === '..' || [...part].some((character) => character.charCodeAt(0) < 32))
  )
    throw new Error('Use folder names without dot segments or control characters.')
  return parts.join('/')
}

export function directoryFolders(files: DatasetPiece[], folders: string[]): string[] {
  const result = new Set<string>()
  for (const value of [
    ...folders,
    ...files.filter((file) => !isDeletionScheduled(file)).map((file) => file.folderPath ?? ''),
  ]) {
    const parts = normalizeFolder(value).split('/').filter(Boolean)
    for (let i = 1; i <= parts.length; i++) result.add(parts.slice(0, i).join('/'))
  }
  // Keep descendants beside their parent, even when a sibling shares its prefix.
  return [...result].sort((left, right) => {
    const a = left.split('/')
    const b = right.split('/')
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
    }
    return a.length - b.length
  })
}

export function readFolders(scope: string): string[] {
  try {
    return folderStore.read(scope)
  } catch {
    return []
  }
}

export function saveFolders(scope: string, folders: string[]): Promise<string[]> {
  const normalized = directoryFolders([], folders)
  return folderStore.mutate(scope, (current) => directoryFolders([], [...current, ...normalized]))
}

/** Recheck both stores under their shared wallet/network lock before removing a folder. */
export async function deleteEmptyFolder(scope: string, path: string): Promise<string[]> {
  const target = normalizeFolder(path)
  if (!scope || !target) throw new Error('The root folder cannot be deleted.')
  return folderStore.mutate(
    scope,
    (current) => {
      const files = readDirectoryPieces(scope).filter((file) => !isDeletionScheduled(file))
      if (
        files.some((file) => (file.folderPath ?? '') === target) ||
        directoryFolders(files, current).some((folder) => folder.startsWith(`${target}/`))
      )
        throw new Error('This folder is not empty. Move its files and remove its subfolders first.')
      return current.filter((folder) => folder !== target)
    },
    { retainOnFailure: false }
  )
}

export function parseDirectoryBackup(
  raw: string,
  scope: string,
  network: string
): { files: DatasetPiece[]; folders: string[] } {
  const backup = JSON.parse(raw)
  if (backup?.version !== 1 || backup.scope !== scope || !Array.isArray(backup.files) || !Array.isArray(backup.folders))
    throw new Error('Choose a directory backup for this wallet and network.')
  const ids = new Set<string>()
  const files: DatasetPiece[] = backup.files.map((file: DatasetPiece) => {
    if (!file || typeof file.id !== 'string' || !file.id || ids.has(file.id) || file.network !== network)
      throw new Error('Invalid or duplicate file record')
    ids.add(file.id)
    for (const field of [
      'fileName',
      'fileSize',
      'cid',
      'pieceCid',
      'providerName',
      'datasetId',
      'providerId',
      'serviceURL',
      'transactionHash',
    ] as const) {
      if (typeof file[field] !== 'string') throw new Error(`Invalid ${field}`)
    }
    if (file.importedCar !== undefined && typeof file.importedCar !== 'boolean')
      throw new Error('Invalid CAR import flag')
    if (file.cid) CID.parse(file.cid)
    pieceFrom(file.pieceCid)
    if (
      !file.fileName.trim() ||
      !Number.isFinite(file.uploadedAt) ||
      file.uploadedAt < 0 ||
      !Number.isSafeInteger(file.pieceId) ||
      file.pieceId < 0
    )
      throw new Error('Invalid file timestamp or piece ID')
    for (const field of [
      'datasetIds',
      'providerIds',
      'providerNames',
      'serviceURLs',
      'transactionHashes',
      'pieceIds',
    ] as const) {
      if (
        file[field] !== undefined &&
        (!Array.isArray(file[field]) || !file[field]?.every((value) => typeof value === 'string'))
      )
        throw new Error(`Invalid ${field}`)
    }
    const datasetIds = file.datasetIds ?? [file.datasetId]
    if (!datasetIds.length || datasetIds[0] !== file.datasetId || new Set(datasetIds).size !== datasetIds.length)
      throw new Error('Invalid storage copies')
    for (const id of [file.datasetId, ...datasetIds])
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error('Invalid dataset ID')
    for (const field of ['providerIds', 'providerNames', 'serviceURLs', 'pieceIds'] as const)
      if (file[field] && file[field]?.length > datasetIds.length) throw new Error(`Invalid ${field} copy count`)
    if (
      file.deletion &&
      (typeof file.deletion !== 'object' ||
        Array.isArray(file.deletion) ||
        Object.entries(file.deletion).some(
          ([id, value]) =>
            !datasetIds.includes(id) ||
            !value ||
            !/^0x[\da-f]{64}$/i.test(value.transactionHash) ||
            typeof value.confirmed !== 'boolean' ||
            (value.remaining !== undefined && typeof value.remaining !== 'boolean')
        ))
    )
      throw new Error('Invalid deletion receipt')
    // Rebuild allowed fields so credentials and arbitrary extra properties are never imported.
    return {
      id: file.id,
      fileName: file.fileName,
      fileSize: file.fileSize,
      ...(file.importedCar ? { importedCar: true } : {}),
      cid: file.cid,
      pieceCid: file.pieceCid,
      providerName: file.providerName,
      datasetId: file.datasetId,
      providerId: file.providerId,
      serviceURL: file.serviceURL,
      transactionHash: file.transactionHash,
      network: file.network,
      uploadedAt: file.uploadedAt,
      pieceId: file.pieceId,
      folderPath: normalizeFolder(file.folderPath ?? ''),
      copyCount: datasetIds.length,
      datasetIds: file.datasetIds,
      providerIds: file.providerIds,
      providerNames: file.providerNames,
      serviceURLs: file.serviceURLs,
      transactionHashes: file.transactionHashes,
      pieceIds: file.pieceIds,
      ipfsIndexed: file.ipfsIndexed === true,
      deletion: file.deletion
        ? Object.fromEntries(
            Object.entries(file.deletion).map(([id, receipt]) => [
              id,
              {
                transactionHash: receipt.transactionHash,
                confirmed: receipt.confirmed,
                ...(receipt.remaining === undefined ? {} : { remaining: receipt.remaining }),
              },
            ])
          )
        : undefined,
    }
  })
  if (!backup.folders.every((value: unknown) => typeof value === 'string')) throw new Error('Invalid folders')
  return { files, folders: directoryFolders(files, backup.folders) }
}
