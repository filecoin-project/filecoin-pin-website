import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { isDeletionScheduled } from '../../utils/file-deletion.ts'
import { formatFileSize } from '../../utils/format-file-size.ts'
import { contentReader } from './ipfs-content.ts'

export async function recoverContentInfo(file: DatasetPiece, signal: AbortSignal) {
  try {
    const entry = await contentReader(file, signal, true).entry()
    if (entry.type === 'directory') return { fileSize: '—', isDirectory: true }
    if (entry.type !== 'file' && entry.type !== 'raw' && entry.type !== 'identity')
      throw new Error('Unsupported content root.')
    const size = Number(entry.size)
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid original file size.')
    return { fileSize: formatFileSize(size), isDirectory: false }
  } catch (cause) {
    throw new Error('Original file size is unavailable from the recorded storage providers.', { cause })
  }
}

export async function recoverFileSize(file: DatasetPiece, signal: AbortSignal): Promise<string> {
  return (await recoverContentInfo(file, signal)).fileSize
}

/** Optional enrichment: failures must not block discovery or hide cached files. */
export async function recoverMissingFileSizes(
  files: DatasetPiece[],
  signal: AbortSignal,
  save: (file: DatasetPiece, size: string, isDirectory?: boolean) => Promise<void>
) {
  const seen = new Set<string>()
  const pending = files.filter((file) => {
    if (file.fileSize !== 'Unknown' || !file.cid || file.importedCar || isDeletionScheduled(file) || seen.has(file.cid))
      return false
    seen.add(file.cid)
    return true
  })
  await Promise.all(
    Array.from({ length: Math.min(2, pending.length) }, async () => {
      while (!signal.aborted) {
        const file = pending.shift()
        if (!file) return
        try {
          const info = await recoverContentInfo(file, signal)
          signal.throwIfAborted()
          if (info.isDirectory) await save(file, info.fileSize, true)
          else await save(file, info.fileSize)
        } catch {
          // The provider can be offline or lack raw-block retrieval. Keep Unknown.
        }
      }
    })
  )
}
