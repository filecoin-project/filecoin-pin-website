import { exporter } from 'ipfs-unixfs-exporter'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { isDeletionScheduled } from '../../utils/file-deletion.ts'
import { formatFileSize } from '../../utils/format-file-size.ts'

// Read one IPFS block, never the complete multi-block file or stored CAR.
const MAX_ROOT_BYTES = 2 * 1024 * 1024

export async function recoverFileSize(file: DatasetPiece, signal: AbortSignal): Promise<string> {
  const root = CID.parse(file.cid)
  if (root.multihash.code !== sha256.code || (root.code !== 0x55 && root.code !== 0x70))
    throw new Error('Unsupported file root for size recovery.')
  const urls = [...new Set(file.serviceURLs ?? [file.serviceURL])].filter(Boolean)
  let failure: unknown
  for (const serviceURL of urls) {
    signal.throwIfAborted()
    let response: Response | undefined
    try {
      const url = new URL(`/ipfs/${root}?format=raw`, serviceURL)
      response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
        credentials: 'omit',
      })
      if (
        !response.ok ||
        !response.headers.get('content-type')?.startsWith('application/vnd.ipld.raw') ||
        !response.body
      )
        throw new Error('Storage provider did not return a raw IPFS block.')
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > MAX_ROOT_BYTES) throw new Error('IPFS root block exceeds the size-recovery budget.')
          chunks.push(chunk.value)
        }
      } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      const digest = await sha256.digest(bytes)
      if (!CID.create(root.version, root.code, digest).equals(root))
        throw new Error('IPFS root block does not match its CID.')
      const entry = await exporter(root.toString(), {
        get: async function* (cid) {
          if (!CID.parse(cid.toString()).equals(root)) throw new Error('Size recovery must not fetch child blocks.')
          yield bytes
        },
      })
      if (entry.type !== 'file' && entry.type !== 'raw') throw new Error('The root is not a single file.')
      const fileSize = Number(entry.size)
      if (!Number.isSafeInteger(fileSize) || fileSize < 0) throw new Error('Invalid original file size.')
      return formatFileSize(fileSize)
    } catch (cause) {
      failure = cause
      signal.throwIfAborted()
    } finally {
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined)
    }
  }
  throw new Error('Original file size is unavailable from the recorded storage providers.', { cause: failure })
}

/** Optional enrichment: failures must not block discovery or hide cached files. */
export async function recoverMissingFileSizes(
  files: DatasetPiece[],
  signal: AbortSignal,
  save: (file: DatasetPiece, size: string) => Promise<void>
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
          const size = await recoverFileSize(file, signal)
          signal.throwIfAborted()
          await save(file, size)
        } catch {
          // The provider can be offline or lack raw-block retrieval. Keep Unknown.
        }
      }
    })
  )
}
