import { downloadAndValidate } from '@filoz/synapse-core/piece'
import type { Synapse } from '@filoz/synapse-sdk'
import { CarReader } from '@ipld/car'
import * as fee from 'filecoin-encryption-envelope'
import { exporter } from 'ipfs-unixfs-exporter'
import { CID } from 'multiformats/cid'
import type { Hex } from 'viem'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { zipDirectory } from './directory.ts'
import { displayFileName } from './drive-api.ts'
import { payloadEntry } from './encrypted-payload.ts'
import {
  CAR_CONTENT_TYPE,
  CredentialAccessError,
  createShareLink,
  decryptEnvelope,
  type EncryptionCredential,
  grantKeyResolver,
  isEncryptionEnvelope,
  type OwnerSigner,
  ownerKeyResolver,
  ShareCredentialError,
} from './encryption.ts'
import { contentReader } from './ipfs-content.ts'

/** Stages surfaced to the download queue; 'unlocking' marks the owner-wallet signature fallback. */
export type DownloadStage = 'downloading' | 'preparing' | 'unlocking'

/**
 * Everything a download may use to read an encrypted piece: the browser grant
 * first (silent), then the owner wallet (one signature with a commitment, two
 * without). All optional — plaintext pieces need none of it.
 */
export type DecryptCredentials = {
  session?: { privateKey: Hex; credential: EncryptionCredential }
  ownerSigner?: () => Promise<OwnerSigner | undefined> | OwnerSigner | undefined
  /** Target-group commitment when no session is supplied; session commitments are matched to envelope labels. */
  commitment?: string
}

/**
 * Assemble DecryptCredentials from the active encryption state: the session
 * grant when a key is set up, nothing when it isn't. Pass `ownerSigner` to
 * allow the owner-wallet fallback (download, preview, share) — omit it for
 * passive browsing (directory listings), which should never prompt a wallet
 * signature on its own.
 */
export function decryptCredentials(
  encryption: { ready: boolean; sessionPrivateKey?: Hex; credential?: EncryptionCredential },
  ownerSigner?: DecryptCredentials['ownerSigner']
): DecryptCredentials {
  return {
    ...(encryption.ready && encryption.sessionPrivateKey && encryption.credential
      ? {
          session: { privateKey: encryption.sessionPrivateKey, credential: encryption.credential },
          commitment: encryption.credential.commitment,
        }
      : {}),
    ...(ownerSigner ? { ownerSigner } : {}),
  }
}

export async function unpackFile(
  carBytes: Uint8Array,
  rootCid: string,
  path = '',
  directoryName?: string
): Promise<Blob> {
  return unpackCarFile(await CarReader.fromBytes(carBytes), rootCid, path, directoryName)
}

async function unpackCarFile(reader: CarReader, rootCid: string, path: string, directoryName?: string): Promise<Blob> {
  const root = CID.parse(rootCid)
  if (!(await reader.getRoots()).some((cid) => cid.equals(root)))
    throw new Error('Downloaded CAR does not contain the expected root CID')
  const blockstore = {
    get: async function* (cid: CID) {
      const block = await reader.get(CID.parse(cid.toString()))
      if (!block) throw new Error('Missing file block in downloaded CAR')
      yield block.bytes
    },
  }
  const resolve = (target: string) => exporter(target, blockstore)
  const entry = await resolve(`${rootCid}${path ? `/${path}` : ''}`)
  if (directoryName && entry.type === 'directory') return zipDirectory(entry, resolve, directoryName)
  if (entry.type !== 'file' && entry.type !== 'raw' && entry.type !== 'identity')
    throw new Error('This record is not a single file')
  const chunks: ArrayBuffer[] = []
  for await (const chunk of entry.content()) chunks.push(new Uint8Array(chunk).buffer)
  return new Blob(chunks, { type: 'application/octet-stream' })
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

class MissingCarBlockError extends Error {}

async function carRootFile(reader: CarReader) {
  const roots = await reader.getRoots()
  if (!roots.length) throw new Error('Downloaded CAR is missing its root CID')
  for (const root of roots) if (!(await reader.has(root))) throw new Error('Downloaded CAR is missing its root block')
  if (roots.length !== 1 || ![0x55, 0x70, 0x00].includes(roots[0].code)) return undefined
  const entry = await exporter(roots[0].toString(), {
    get: async function* (cid: CID) {
      const block = await reader.get(cid)
      if (!block) throw new MissingCarBlockError('Missing file block in downloaded CAR')
      yield block.bytes
    },
  })
  if (entry.type === 'file' || entry.type === 'raw' || entry.type === 'identity') return entry
}

function envelopePrefix(entry: NonNullable<Awaited<ReturnType<typeof carRootFile>>>): fee.RandomAccessSource {
  return {
    size: Number(entry.size),
    async openRange(offset, length) {
      // Legacy UnixFS entries with inline data can report inaccurate nonzero ranges.
      // If the parser needs more than the prefix, use the full extraction below.
      if (offset > 0) throw new Error('Envelope detection needs more than the file prefix')
      const chunks = entry.content({ length, blockReadConcurrency: 1 })
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          const next = await chunks.next()
          if (next.done) controller.close()
          else controller.enqueue(next.value)
        },
        async cancel() {
          await chunks.return()
        },
      })
    },
  }
}

async function detectEnvelope(entry: NonNullable<Awaited<ReturnType<typeof carRootFile>>>) {
  // The exporter yields no file content for these legacy entry types.
  if (entry.type === 'file' && (entry.unixfs.type === 'metadata' || entry.unixfs.type === 'symlink')) return false
  return isEncryptionEnvelope(envelopePrefix(entry))
}

export async function carRootFileBytes(
  carBytes: Uint8Array,
  allowPartialArchive = false
): Promise<Uint8Array | undefined> {
  const entry = await carRootFile(await CarReader.fromBytes(carBytes))
  if (entry) return readRootFile(entry, allowPartialArchive)
}

async function readRootFile(entry: NonNullable<Awaited<ReturnType<typeof carRootFile>>>, allowPartialArchive = false) {
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for await (const chunk of entry.content()) {
      const bytes = new Uint8Array(chunk)
      chunks.push(bytes)
      size += bytes.length
    }
  } catch (cause) {
    // A known plaintext import can be saved as the original partial archive.
    if (allowPartialArchive && cause instanceof MissingCarBlockError) return undefined
    throw cause
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

async function downloadEnvelope(reader: CarReader, file: DatasetPiece): Promise<Uint8Array | undefined> {
  const entry = await carRootFile(reader)
  if (!entry) return
  // Only ordinary downloads would extract this same UnixFS file again to save it.
  if (!file.encrypted && !file.importedCar) {
    // Retry through the full read if the legacy entry cannot supply the requested range.
    const encrypted = await detectEnvelope(entry).catch(() => undefined)
    if (encrypted === false) return
    if (encrypted) return readRootFile(entry)
  }
  const bytes = await readRootFile(entry, file.importedCar === true && !file.encrypted)
  if (bytes && (await isEncryptionEnvelope(bytes))) return bytes
}

/**
 * Fetch a piece's CAR from any dataset context or storage-provider endpoint
 * holding a copy. A copy whose root does not match the record falls through to
 * the next copy; content processing happens once, after retrieval.
 */
async function fetchPieceCarWithReader(synapse: Synapse | null, file: DatasetPiece, signal?: AbortSignal) {
  const attempts: (() => Promise<Uint8Array>)[] = []
  if (synapse)
    for (const datasetId of file.datasetIds ?? [file.datasetId]) {
      if (!datasetId) continue
      attempts.push(async () => {
        const context = await synapse.storage.createContext({ dataSetId: BigInt(datasetId) })
        signal?.throwIfAborted()
        return context.download({ pieceCid: file.pieceCid, withCDN: false })
      })
    }
  const providerUrls: string[] = []
  for (const provider of file.upload?.providers ?? []) {
    if (provider.stored) providerUrls.push(provider.serviceURL)
  }
  // Pieces loaded from chain on another device carry no upload checkpoint,
  // only the indexed provider service URLs.
  for (const serviceURL of file.serviceURLs ?? (file.serviceURL ? [file.serviceURL] : [])) {
    if (serviceURL && !providerUrls.includes(serviceURL)) providerUrls.push(serviceURL)
  }
  for (const serviceURL of providerUrls) {
    if (!file.pieceCid) continue
    attempts.push(() =>
      downloadAndValidate({
        url: new URL(`/piece/${encodeURIComponent(file.pieceCid)}`, serviceURL).href,
        expectedPieceCid: file.pieceCid,
        signal,
      })
    )
  }
  const expectedRoot = file.cid
  let failure: unknown
  for (const retrieve of attempts) {
    signal?.throwIfAborted()
    try {
      const bytes = await retrieve()
      signal?.throwIfAborted()
      const reader = await CarReader.fromBytes(bytes)
      if (!(await reader.getRoots()).some((cid) => cid.toString() === expectedRoot))
        throw new Error('Downloaded CAR does not contain the expected root CID')
      return { bytes, reader }
    } catch (cause) {
      signal?.throwIfAborted()
      failure = cause
    }
  }
  throw new Error(
    file.importedCar
      ? 'Unable to download the CAR archive from its storage providers. Try again later.'
      : 'Unable to download the file from its storage providers. Try again later.',
    {
      cause: failure,
    }
  )
}

/** A session's commitment is valid only for its own owner and group key. */
function commitmentForEnvelope(credentials: DecryptCredentials, labels: Record<string, unknown> | undefined) {
  const credential = credentials.session?.credential
  if (!credential) return credentials.commitment
  const owner = labels?.['foc/own']
  return typeof owner === 'string' &&
    owner.toLowerCase() === credential.owner.toLowerCase() &&
    labels?.['foc/ks'] === credential.groupKeyId
    ? credential.commitment
    : undefined
}

/** Grant first (silent), owner wallet second ('unlocking' — may prompt a signature). */
export async function decryptWithCredentials(
  envelope: Uint8Array,
  credentials: DecryptCredentials,
  onStage?: (stage: DownloadStage) => void,
  signal?: AbortSignal
): Promise<Uint8Array> {
  signal?.throwIfAborted()
  if (credentials.session) {
    try {
      return await decryptEnvelope(
        envelope,
        grantKeyResolver(credentials.session.privateKey, credentials.session.credential)
      )
    } catch (cause) {
      // Only unusable saved credentials warrant an owner-wallet prompt.
      signal?.throwIfAborted()
      if (!(cause instanceof CredentialAccessError)) throw cause
    }
  }
  signal?.throwIfAborted()
  onStage?.('unlocking')
  const signer = await credentials.ownerSigner?.()
  signal?.throwIfAborted()
  const info = await fee.parse(envelope)
  signal?.throwIfAborted()
  // One signature serves the whole page session: later decrypts under the
  // same group key reuse the remembered key with no further prompts.
  return decryptEnvelope(
    envelope,
    ownerKeyResolver(() => signer, commitmentForEnvelope(credentials, info.appMetadata), { remember: true, signal })
  )
}

/**
 * Where the plaintext lives inside a decrypted payload. New uploads follow
 * the filecoin-pin profile (anonymous wrapper directory, one named entry);
 * uploads from before the profile carried the content at the root directly.
 */
async function decryptedTarget(inner: Uint8Array): Promise<{ root: string; prefix: string }> {
  const reader = await CarReader.fromBytes(inner)
  const root = (await reader.getRoots())[0]
  if (!root) throw new Error('The decrypted content is missing its root CID.')
  const entry = await payloadEntry(reader)
  return { root: root.toString(), prefix: entry?.name ?? '' }
}

/** Save the original file; return its inner CID only after a successful encrypted download. */
export async function downloadFile(
  synapse: Synapse,
  file: DatasetPiece,
  credentials: DecryptCredentials = {},
  onStage?: (stage: DownloadStage) => void
) {
  if (!file.cid)
    throw new Error('The IPFS root CID is missing from this record. Use Load from Filecoin after the index catches up.')
  onStage?.('downloading')
  const { bytes, reader } = await fetchPieceCarWithReader(synapse, file)
  onStage?.('preparing')
  // Detection is by content, not trust: a piece is encrypted exactly when its
  // root is a single file that parses as an FEE envelope.
  const envelope = await downloadEnvelope(reader, file)
  if (envelope) {
    const inner = await decryptWithCredentials(envelope, credentials, onStage)
    const target = await decryptedTarget(inner)
    if (file.importedCar) {
      // The payload's single entry is the imported CAR verbatim (legacy
      // uploads carried the raw CAR with no wrapper); save it byte-exact.
      if (target.prefix === '') {
        saveBlob(new Blob([new Uint8Array(inner).buffer], { type: CAR_CONTENT_TYPE }), displayFileName(file))
        return target.root
      }
      const archive = await unpackFile(inner, target.root, target.prefix)
      saveBlob(new Blob([await archive.arrayBuffer()], { type: CAR_CONTENT_TYPE }), displayFileName(file))
      return target.root
    }
    const path = target.prefix
    const blob = await unpackFile(inner, target.root, path, displayFileName(file))
    saveBlob(blob, `${displayFileName(file)}${blob.type === 'application/zip' ? '.zip' : ''}`)
    return target.root
  }
  if (file.encrypted)
    throw new Error('The encrypted upload has an invalid or unsupported encryption envelope. No file was saved.')
  if (file.importedCar) {
    saveBlob(new Blob([new Uint8Array(bytes).buffer], { type: CAR_CONTENT_TYPE }), displayFileName(file))
    return
  }
  const blob = await unpackCarFile(reader, file.cid, '', displayFileName(file))
  saveBlob(blob, `${displayFileName(file)}${blob.type === 'application/zip' ? '.zip' : ''}`)
}

/**
 * Mint a keysmith share link for a stored encrypted piece. The envelope's own
 * header labels name the piece key: the session grant signs silently, and
 * without one the owner wallet signs once (remembered for the page session).
 * Anyone with the link can read this one upload, forever — share links
 * cannot be revoked.
 */
export async function encryptedPieceShareLink(
  synapse: Synapse | null,
  file: DatasetPiece,
  credentials: DecryptCredentials,
  signal?: AbortSignal
): Promise<string> {
  signal?.throwIfAborted()
  const info = await readShareEnvelope(synapse, file, signal)
  signal?.throwIfAborted()
  const appMetadata = info.appMetadata as Record<string, unknown>
  if (credentials.session) {
    try {
      return await createShareLink({
        sender: { sessionPrivateKey: credentials.session.privateKey, credential: credentials.session.credential },
        rootCid: file.cid,
        appMetadata,
        signal,
      })
    } catch (cause) {
      signal?.throwIfAborted()
      if (!(cause instanceof ShareCredentialError)) throw cause
      // Only an unusable saved credential warrants an owner-wallet fallback.
    }
  }
  signal?.throwIfAborted()
  const signer = await credentials.ownerSigner?.()
  signal?.throwIfAborted()
  if (!signer) throw new Error('Connect the wallet that owns this file to share it.')
  return createShareLink({
    sender: { signer, commitment: commitmentForEnvelope(credentials, appMetadata) },
    rootCid: file.cid,
    appMetadata,
    signal,
  })
}

async function readShareEnvelope(synapse: Synapse | null, file: DatasetPiece, signal?: AbortSignal) {
  try {
    const entry = await contentReader(file, signal ?? new AbortController().signal).entry()
    if (entry.type === 'raw' || entry.type === 'identity' || entry.type === 'file') {
      return await fee.parse(envelopePrefix(entry))
    }
  } catch {
    // Older providers may not serve raw IPFS blocks. Keep piece retrieval available.
    signal?.throwIfAborted()
  }
  const { reader } = await fetchPieceCarWithReader(synapse, file, signal)
  signal?.throwIfAborted()
  const entry = await carRootFile(reader)
  const envelope = entry && (await readRootFile(entry))
  if (envelope) {
    try {
      return await fee.parse(envelope)
    } catch (cause) {
      if (!(cause instanceof fee.errors.MalformedEnvelopeError)) throw cause
    }
  }
  if (file.encrypted) throw new Error('The encrypted upload has an invalid or unsupported encryption envelope.')
  throw new Error('This record is not an encrypted upload.')
}
