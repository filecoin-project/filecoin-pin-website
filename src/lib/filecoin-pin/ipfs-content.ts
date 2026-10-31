import { exporter } from 'ipfs-unixfs-exporter'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

const MAX_BLOCK_BYTES = 2 * 1024 * 1024
const CACHE_BYTES = 16 * 1024 * 1024

/** Direct, bounded provider reads. Never trust a block without checking its CID. */
export function contentReader(file: DatasetPiece, signal: AbortSignal, rootOnly = false) {
  const urls = [
    ...new Set([
      ...(file.serviceURLs ?? [file.serviceURL]),
      ...(file.upload?.providers
        .filter((provider) => provider.stored || provider.confirmed)
        .map((provider) => provider.serviceURL) ?? []),
    ]),
  ].filter(Boolean)
  const cache = new Map<string, Uint8Array>()
  let cachedBytes = 0
  const read = async (cid: CID): Promise<Uint8Array> => {
    signal.throwIfAborted()
    if (rootOnly && cid.toString() !== file.cid) throw new Error('Root inspection must not fetch child blocks.')
    const known = cache.get(cid.toString())
    if (known) return known
    if (cid.multihash.code !== sha256.code) throw new Error('Unsupported IPFS block hash.')
    let failure: unknown
    for (const serviceURL of urls) {
      let response: Response | undefined
      try {
        const url = new URL(`/ipfs/${cid}?format=raw`, serviceURL)
        if (!['http:', 'https:'].includes(url.protocol)) continue
        response = await fetch(url, {
          credentials: 'omit',
          signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
        })
        if (
          !response.ok ||
          !response.headers.get('content-type')?.startsWith('application/vnd.ipld.raw') ||
          !response.body
        )
          throw new Error('Provider did not return a raw IPFS block.')
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let size = 0
        try {
          while (true) {
            const chunk = await reader.read()
            if (chunk.done) break
            size += chunk.value.byteLength
            if (size > MAX_BLOCK_BYTES) throw new Error('IPFS block exceeds the retrieval budget.')
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
        if (!CID.create(cid.version, cid.code, await sha256.digest(bytes)).equals(cid))
          throw new Error('IPFS block does not match its CID.')
        cache.set(cid.toString(), bytes)
        cachedBytes += bytes.length
        while (cachedBytes > CACHE_BYTES && cache.size > 1) {
          const oldest = cache.keys().next().value
          if (!oldest) break
          cachedBytes -= cache.get(oldest)?.length ?? 0
          cache.delete(oldest)
        }
        return bytes
      } catch (cause) {
        failure = cause
        signal.throwIfAborted()
      } finally {
        if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined)
      }
    }
    throw new Error('Content is unavailable from its storage providers. Try again later.', { cause: failure })
  }
  const blockstore = {
    get: async function* (cid: CID) {
      yield await read(CID.parse(cid.toString()))
    },
  }
  return { rootCid: file.cid, entry: (path = '') => exporter(`${file.cid}${path ? `/${path}` : ''}`, blockstore) }
}

export type ContentReader = ReturnType<typeof contentReader>
export function safeDirectoryName(name: string) {
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    [...name].some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error('The directory contains an unsafe file name.')
  return name
}
