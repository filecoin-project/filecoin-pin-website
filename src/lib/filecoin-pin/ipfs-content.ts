import { CarReader } from '@ipld/car'
import { exporter } from 'ipfs-unixfs-exporter'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { carRootFileBytes, type DecryptCredentials, decryptWithCredentials, fetchPieceCar } from './download.ts'
import { payloadEntry } from './encrypted-payload.ts'
import { isEncryptionEnvelope } from './encryption.ts'

const MAX_BLOCK_BYTES = 2 * 1024 * 1024
const CACHE_BYTES = 16 * 1024 * 1024

/**
 * Browsing an encrypted piece cannot stream ciphertext blocks: fetch the whole
 * envelope once from the piece's providers, decrypt it with the session grant
 * or an explicitly supplied owner signer, and walk the inner CAR.
 * The reader stays keyed by the outer root so directory caching is unchanged.
 */
function encryptedContentReader(file: DatasetPiece, signal: AbortSignal, credentials: DecryptCredentials) {
  let opened: Promise<{ reader: CarReader; root: string; prefix: string }> | undefined
  const open = () => {
    opened ??= (async () => {
      const session = credentials.session
      if (!session && !credentials.ownerSigner) throw new Error('Connect your wallet to browse this encrypted folder.')
      const carBytes = await fetchPieceCar(null, file)
      signal.throwIfAborted()
      const envelope = await carRootFileBytes(carBytes)
      if (!envelope || !(await isEncryptionEnvelope(envelope)))
        throw new Error('This record is marked encrypted but is not an encryption envelope.')
      const inner = await decryptWithCredentials(envelope, credentials, undefined, signal)
      signal.throwIfAborted()
      const reader = await CarReader.fromBytes(inner)
      const [root] = await reader.getRoots()
      if (!root) throw new Error('The decrypted content is missing its root CID.')
      // New payloads wrap the folder in an anonymous directory with one named
      // entry; browsing paths stay relative to the folder itself.
      const prefix = await payloadEntry(reader).then(
        (entry) => entry.name,
        () => ''
      )
      return { reader, root: root.toString(), prefix }
    })().catch((cause: unknown) => {
      // A failed fetch or missing grant must not stick to the reader; the next
      // entry() call starts over.
      opened = undefined
      throw cause
    })
    return opened
  }
  return {
    rootCid: file.cid,
    entry: async (path = '') => {
      const { reader, root, prefix } = await open()
      signal.throwIfAborted()
      const blockstore = {
        get: async function* (cid: CID) {
          const block = await reader.get(CID.parse(cid.toString()))
          if (!block) throw new Error('Missing file block in the decrypted content')
          yield block.bytes
        },
      }
      const inside = [prefix, path].filter(Boolean).join('/')
      return exporter(`${root}${inside ? `/${inside}` : ''}`, blockstore)
    },
  }
}

/** Direct, bounded provider reads. Never trust a block without checking its CID. */
export function contentReader(
  file: DatasetPiece,
  signal: AbortSignal,
  rootOnly = false,
  credentials: DecryptCredentials = {}
) {
  // Root-only inspection stays on gateway reads: the outer root block of an
  // encrypted piece is public, and size probes must never trigger a decrypt.
  if (file.encrypted && !rootOnly) return encryptedContentReader(file, signal, credentials)
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
