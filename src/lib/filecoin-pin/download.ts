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
  const reader = await CarReader.fromBytes(carBytes)
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

/**
 * Extract a single root file, or return undefined for a non-file layout.
 * Only known plaintext CAR imports may omit descendant blocks: their original
 * archive bytes remain downloadable without pretending the DAG is complete.
 */
export async function carRootFileBytes(
  carBytes: Uint8Array,
  allowPartialArchive = false
): Promise<Uint8Array | undefined> {
  const reader = await CarReader.fromBytes(carBytes)
  const roots = await reader.getRoots()
  if (!roots.length) throw new Error('Downloaded CAR is missing its root CID')
  for (const root of roots) if (!(await reader.has(root))) throw new Error('Downloaded CAR is missing its root block')
  if (roots.length !== 1 || ![0x55, 0x70, 0x00].includes(roots[0].code)) return undefined
  try {
    const blockstore = {
      get: async function* (cid: CID) {
        const block = await reader.get(CID.parse(cid.toString()))
        if (!block) throw new MissingCarBlockError('Missing file block in downloaded CAR')
        yield block.bytes
      },
    }
    const entry = await exporter(roots[0].toString(), blockstore)
    if (entry.type !== 'file' && entry.type !== 'raw' && entry.type !== 'identity') return undefined
    const chunks: Uint8Array[] = []
    let size = 0
    for await (const chunk of entry.content()) {
      const bytes = new Uint8Array(chunk)
      chunks.push(bytes)
      size += bytes.length
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    return bytes
  } catch (cause) {
    if (allowPartialArchive && cause instanceof MissingCarBlockError) return undefined
    throw cause
  }
}

/**
 * Fetch a piece's CAR from any dataset context or storage-provider endpoint
 * holding a copy. A copy whose root does not match the record falls through to
 * the next copy; content processing happens once, after retrieval.
 */
export async function fetchPieceCar(synapse: Synapse | null, file: DatasetPiece): Promise<Uint8Array> {
  const attempts: (() => Promise<Uint8Array>)[] = []
  if (synapse)
    for (const datasetId of file.datasetIds ?? [file.datasetId]) {
      if (!datasetId) continue
      attempts.push(async () => {
        const context = await synapse.storage.createContext({ dataSetId: BigInt(datasetId) })
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
      })
    )
  }
  const expectedRoot = file.directoryEntry?.rootCid ?? file.cid
  let failure: unknown
  for (const retrieve of attempts) {
    try {
      const bytes = await retrieve()
      const reader = await CarReader.fromBytes(bytes)
      if (!(await reader.getRoots()).some((cid) => cid.toString() === expectedRoot))
        throw new Error('Downloaded CAR does not contain the expected root CID')
      return bytes
    } catch (cause) {
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

/** Integrity failures no other key can fix: tampered or truncated ciphertext. */
function isIntegrityError(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    (cause.cause instanceof fee.errors.AuthenticationError ||
      cause.cause instanceof fee.errors.InvalidCiphertextLengthError)
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
      // A stale or foreign grant leaves the owner wallet as the way in;
      // tampered or truncated ciphertext does not.
      signal?.throwIfAborted()
      if (isIntegrityError(cause)) throw cause
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
  try {
    const entry = await payloadEntry(reader)
    return { root: root.toString(), prefix: entry.name }
  } catch {
    return { root: root.toString(), prefix: '' }
  }
}

export async function downloadFile(
  synapse: Synapse,
  file: DatasetPiece,
  credentials: DecryptCredentials = {},
  onStage?: (stage: DownloadStage) => void
) {
  if (!file.cid)
    throw new Error('The IPFS root CID is missing from this record. Use Load from Filecoin after the index catches up.')
  // Plaintext directory children stream straight from provider gateways. The
  // inner blocks of an encrypted piece are never stored as blocks, so those
  // take the whole-envelope path below.
  if (file.directoryEntry && !file.isDirectory && !file.encrypted) {
    try {
      onStage?.('downloading')
      const entry = await contentReader(file, new AbortController().signal).entry()
      if (entry.type !== 'file' && entry.type !== 'raw' && entry.type !== 'identity')
        throw new Error('Not a single file.')
      const chunks: ArrayBuffer[] = []
      for await (const chunk of entry.content()) chunks.push(new Uint8Array(chunk).buffer)
      saveBlob(new Blob(chunks, { type: 'application/octet-stream' }), displayFileName(file))
      return
    } catch {
      // The whole-CAR path below retries from dataset contexts and providers.
    }
  }
  onStage?.('downloading')
  const bytes = await fetchPieceCar(synapse, file)
  onStage?.('preparing')
  // Detection is by content, not trust: a piece is encrypted exactly when its
  // root is a single file that parses as an FEE envelope.
  const envelope = await carRootFileBytes(bytes, file.importedCar === true && !file.encrypted)
  if (envelope && (await isEncryptionEnvelope(envelope))) {
    const inner = await decryptWithCredentials(envelope, credentials, onStage)
    const target = await decryptedTarget(inner)
    if (file.importedCar) {
      // The payload's single entry is the imported CAR verbatim (legacy
      // uploads carried the raw CAR with no wrapper); save it byte-exact.
      if (target.prefix === '') {
        saveBlob(new Blob([new Uint8Array(inner).buffer], { type: CAR_CONTENT_TYPE }), displayFileName(file))
        return
      }
      const archive = await unpackFile(inner, target.root, target.prefix)
      saveBlob(new Blob([await archive.arrayBuffer()], { type: CAR_CONTENT_TYPE }), displayFileName(file))
      return
    }
    const path = [target.prefix, file.directoryEntry?.path ?? ''].filter(Boolean).join('/')
    const blob = await unpackFile(inner, target.root, path, displayFileName(file))
    saveBlob(blob, `${displayFileName(file)}${blob.type === 'application/zip' ? '.zip' : ''}`)
    return
  }
  if (file.importedCar) {
    saveBlob(new Blob([new Uint8Array(bytes).buffer], { type: CAR_CONTENT_TYPE }), displayFileName(file))
    return
  }
  const blob = await unpackFile(
    bytes,
    file.directoryEntry?.rootCid ?? file.cid,
    file.directoryEntry?.path ?? '',
    displayFileName(file)
  )
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
  const bytes = await fetchPieceCar(synapse, file)
  const envelope = await carRootFileBytes(bytes)
  if (!envelope || !(await isEncryptionEnvelope(envelope)))
    throw new Error('This record is not an encrypted upload; share its public link instead.')
  signal?.throwIfAborted()
  const info = await fee.parse(envelope)
  signal?.throwIfAborted()
  const appMetadata = info.appMetadata as Record<string, unknown>
  if (credentials.session) {
    try {
      return await createShareLink({
        sender: { sessionPrivateKey: credentials.session.privateKey, credential: credentials.session.credential },
        rootCid: file.directoryEntry?.rootCid ?? file.cid,
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
    rootCid: file.directoryEntry?.rootCid ?? file.cid,
    appMetadata,
    signal,
  })
}
