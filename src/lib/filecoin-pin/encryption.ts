/**
 * Keysmith encryption for Drive uploads, following filecoin-pin's conventions so
 * the CLI and Drive read each other's data: data sets carrying encrypted pieces
 * are tagged `foc/enc`/`foc/gkid`/`foc/kc`, and every envelope names its own
 * group key and salt.
 *
 * Keysmith format 2 only (keysmith 0.2.0). Uploads written by keysmith 0.1.0
 * are read through `encryption-v1.ts`, never from here.
 *
 * Ported from filecoin-pin `src/common/group-key.ts` and `share-link.ts`, which
 * the package builds but does not export. Delete this once filecoin-pin exports
 * its browser-safe encryption modules.
 */
import {
  COMMITMENT_KEY,
  type DecodedGrant,
  dataSetMetadata,
  decodeGrant,
  deriveGroupKey,
  encodeGrant,
  type GrantNode,
  grantDescriptor,
  keyForEnvelope,
  newSalt,
  type PieceMetadataView,
  pieceKey,
  pieceMetadata,
  pieceNode,
  publicKeyOf,
  readPieceMetadata,
  type TypedDataSigner,
  unwrapWith,
  wrapTo,
} from '@filoz/keysmith'
import * as fee from 'filecoin-encryption-envelope'
import { base64, base64url } from 'multiformats/bases/base64'
import type { Address, Hex } from 'viem'
import { concat, hexToBytes, isAddress, keccak256, slice, toHex } from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import { readStreamBytes } from './read-stream.ts'

/** A wallet that can sign for a group key (Keysmith's `GroupKey` message): the owner's own key, never a session key. */
export type OwnerSigner = TypedDataSigner & { address: Address }

/** Data set metadata key that marks a data set as encrypted and versions its rules. */
export const ENCRYPTION_VERSION_KEY = 'foc/enc'
/** The only `foc/enc` value this version writes and reuses. */
export const ENCRYPTION_VERSION = '1'
/** Data set metadata key naming a data set's group key (Keysmith format 2). */
export const GROUP_KEY_ID_KEY = 'foc/gkid'
/** keysmith 0.1.0's group key id key: such data sets are encrypted, but Drive never writes to them. */
const LEGACY_GROUP_KEY_ID_KEY = 'foc/ks'
export const GROUP_KEY_COMMITMENT_KEY = COMMITMENT_KEY
/** Keys that mark a data set as encrypted; an upload reuses a data set only when all of them match. */
export const ENCRYPTED_DATA_SET_KEYS = [
  ENCRYPTION_VERSION_KEY,
  GROUP_KEY_ID_KEY,
  LEGACY_GROUP_KEY_ID_KEY,
  GROUP_KEY_COMMITMENT_KEY,
] as const

/**
 * The id of an owner's first group key, identical across every client that sets
 * one up before any upload:
 * `keccak256(utf8("filecoin/default-group-key") ‖ owner as 20 raw bytes)[0:16]`.
 */
export function defaultGroupKeyId(owner: Address): Hex {
  if (!isAddress(owner, { strict: false })) throw new Error(`Not an address: ${owner}`)
  return slice(keccak256(concat([toHex('filecoin/default-group-key'), owner])), 0, 16)
}

/** A group key recorded on chain: its id and the public commitment that pins the derived key. */
export interface GroupKeyRecord {
  groupKeyId: Hex
  commitment: string
}

/** The data-set shape the group-key scan needs; matches on-chain data set listings. */
export interface GroupKeyDataSet {
  dataSetId: bigint
  metadata?: Record<string, string | undefined>
}

/** Group key ids are matched exactly (0x + 32 lowercase hex), never case-folded. */
const CANONICAL_GROUP_KEY_ID = /^0x[0-9a-f]{32}$/

/**
 * "Oldest wins": group data sets by `foc/gkid`, skip any group key whose id is not
 * canonical, whose data sets disagree on `foc/kc`, or that are not all `foc/enc`
 * "1", and return the remaining group key holding the lowest data set id.
 * Inconsistent group keys are skipped, not refused, so one bad group key cannot
 * block every encrypted upload.
 */
export function oldestValidGroupKey(dataSets: readonly GroupKeyDataSet[]): GroupKeyRecord | undefined {
  const byGroupKey = new Map<string, GroupKeyDataSet[]>()
  for (const dataSet of dataSets) {
    const groupKeyId = dataSet.metadata?.[GROUP_KEY_ID_KEY]
    if (typeof groupKeyId !== 'string') continue
    const members = byGroupKey.get(groupKeyId)
    if (members == null) byGroupKey.set(groupKeyId, [dataSet])
    else members.push(dataSet)
  }
  let best: { groupKeyId: Hex; commitment: string; oldest: bigint } | undefined
  for (const [groupKeyId, members] of byGroupKey) {
    if (!CANONICAL_GROUP_KEY_ID.test(groupKeyId)) continue
    const commitments = new Set(members.map((dataSet) => dataSet.metadata?.[GROUP_KEY_COMMITMENT_KEY]))
    const commitment = members[0]?.metadata?.[GROUP_KEY_COMMITMENT_KEY]
    const versioned = members.every((dataSet) => dataSet.metadata?.[ENCRYPTION_VERSION_KEY] === ENCRYPTION_VERSION)
    if (commitments.size !== 1 || typeof commitment !== 'string' || !versioned) continue
    const oldest = members.reduce(
      (min, dataSet) => (dataSet.dataSetId < min ? dataSet.dataSetId : min),
      members[0]?.dataSetId ?? 0n
    )
    if (best == null || oldest < best.oldest) best = { groupKeyId: groupKeyId as Hex, commitment, oldest }
  }
  return best == null ? undefined : { groupKeyId: best.groupKeyId, commitment: best.commitment }
}

/** The FEE content type of the inner CAR, same label the filecoin-pin CLI writes. */
export const CAR_CONTENT_TYPE = 'application/vnd.ipld.car'

/**
 * Everything the browser stores to encrypt and decrypt without wallet popups.
 * The grant only opens with the session private key it was wrapped to; both
 * live side by side in the session vault.
 */
export interface EncryptionCredential {
  /** base64 (multibase, no prefix handling needed) of the encoded Keysmith Grant. */
  grant: string
  groupKeyId: Hex
  commitment: string
  /** Lowercased owner address the group key belongs to. */
  owner: Address
}

/**
 * Derive the owner's group key (1 wallet signature with a recorded commitment,
 * 2 for a brand-new group key) and wrap it to the browser session key. The
 * group key itself is zeroed before returning; only the wrapped grant leaves.
 */
export async function issueEncryptionCredential(
  signer: OwnerSigner,
  sessionPrivateKey: Hex,
  recorded?: GroupKeyRecord
): Promise<EncryptionCredential> {
  const groupKeyId = recorded?.groupKeyId ?? defaultGroupKeyId(signer.address)
  const keys = await deriveGroupKey(
    signer,
    { owner: signer.address, groupKeyId },
    recorded == null ? {} : { commitment: recorded.commitment }
  )
  try {
    const grant = await wrapTo(publicKeyOf(sessionPrivateKey), keys.groupKey, keys.descriptor)
    return {
      grant: base64.baseEncode(encodeGrant(grant)),
      groupKeyId,
      commitment: keys.commitment,
      owner: signer.address.toLowerCase() as Address,
    }
  } finally {
    keys.groupKey.fill(0)
  }
}

/** The `foc/*` keys every data set holding this credential's pieces must carry (set at creation, immutable after). */
export function encryptedDataSetMetadata(credential: EncryptionCredential): Record<string, string> {
  return {
    [ENCRYPTION_VERSION_KEY]: ENCRYPTION_VERSION,
    ...dataSetMetadata({ owner: credential.owner, groupKeyId: credential.groupKeyId }, credential.commitment),
  }
}

async function throughStream(bytes: Uint8Array, pair: ReadableWritablePair<Uint8Array, Uint8Array>) {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(pair)
  return readStreamBytes(stream)
}

/**
 * Encrypt one upload's CAR into an FEE envelope under a fresh per-piece key.
 * Fresh salt every call: identical plaintext never produces identical ciphertext.
 */
export async function encryptCar(
  sessionPrivateKey: Hex,
  credential: EncryptionCredential,
  innerCar: Uint8Array
): Promise<Uint8Array> {
  return withEncryptedCar(sessionPrivateKey, credential, innerCar, readStreamBytes)
}

export async function encryptCarFile(
  sessionPrivateKey: Hex,
  credential: EncryptionCredential,
  innerCar: Uint8Array
): Promise<File> {
  return withEncryptedCar(sessionPrivateKey, credential, innerCar, async (stream) => {
    const chunks: BlobPart[] = []
    const reader = stream.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return new File(chunks, 'encrypted.fee')
        chunks.push(value as BlobPart)
      }
    } finally {
      reader.releaseLock()
    }
  })
}

async function withEncryptedCar<T>(
  sessionPrivateKey: Hex,
  credential: EncryptionCredential,
  innerCar: Uint8Array,
  consume: (stream: ReadableStream<Uint8Array>) => Promise<T>
): Promise<T> {
  const grant = decodeGrant(base64.baseDecode(credential.grant))
  const node = await unwrapWith(sessionPrivateKey, grant)
  try {
    const salt = newSalt()
    const cek = pieceKey(node, salt)
    const appMetadata = pieceMetadata({ owner: credential.owner, groupKeyId: credential.groupKeyId }, { salt })
    try {
      let offset = 0
      const plaintext = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset === innerCar.length) {
            controller.close()
            return
          }
          const end = Math.min(offset + 64 * 1024, innerCar.length)
          controller.enqueue(innerCar.subarray(offset, end))
          offset = end
        },
      })
      // The stream imports the key lazily, so retain it until consumption finishes.
      return await consume(
        plaintext.pipeThrough(
          fee.encrypt({ cek, appMetadata, contentLength: innerCar.byteLength, contentType: CAR_CONTENT_TYPE })
        )
      )
    } finally {
      cek.fill(0)
    }
  } finally {
    node.fill(0)
  }
}

/** Malformed syntax returns false; unsupported schemes and unexpected failures propagate. */
export async function isEncryptionEnvelope(bytes: Uint8Array | fee.RandomAccessSource): Promise<boolean> {
  try {
    await fee.parse(bytes)
    return true
  } catch (cause) {
    if (cause instanceof fee.errors.MalformedEnvelopeError) return false
    throw cause
  }
}

/**
 * FEE key resolver for the browser grant: opens the grant with the session key
 * and derives the piece key, validating the envelope's owner and group key
 * against the grant.
 */
export function grantKeyResolver(sessionPrivateKey: Hex, credential: EncryptionCredential): fee.KeyResolver {
  return async ({ appMetadata }) => {
    let grant: DecodedGrant
    try {
      grant = decodeGrant(base64.baseDecode(credential.grant))
      grantDescriptor(grant, grant.node as GrantNode)
    } catch (cause) {
      throw new CredentialAccessError('The saved encryption credential is invalid.', { cause })
    }
    let piece: PieceMetadataView
    try {
      piece = readPieceMetadata(appMetadata)
    } catch (cause) {
      throw new KeyAccessError('The encryption envelope has invalid owner or group key labels.', { cause })
    }
    if (!sameGroupKey(piece, grant))
      throw new CredentialAccessError('The saved encryption credential belongs to another owner or encryption group.')
    let node: Uint8Array
    try {
      node = await unwrapWith(sessionPrivateKey, grant)
    } catch (cause) {
      if (cause instanceof Error && cause.cause instanceof Error && cause.cause.name === 'OperationError')
        throw new CredentialAccessError('The saved encryption credential could not be opened.', { cause })
      throw cause
    }
    try {
      return keyForEnvelope(node, appMetadata, grant)
    } finally {
      node.fill(0)
    }
  }
}

/** An envelope without `foc/own` belongs to whoever holds its group key, so only a named owner can mismatch. */
function sameGroupKey(piece: PieceMetadataView, held: { owner: string; groupKeyId: string }): boolean {
  return (
    (piece.owner == null || piece.owner.toLowerCase() === held.owner.toLowerCase()) &&
    piece.groupKeyId === held.groupKeyId.toLowerCase()
  )
}

/** Decrypt an FEE envelope back to its inner bytes, mapping FEE errors to user vocabulary. */
export async function decryptEnvelope(
  envelope: Uint8Array,
  resolver: Uint8Array | fee.KeyResolver
): Promise<Uint8Array> {
  try {
    return await throughStream(envelope, { ...fee.decrypt(resolver) })
  } catch (error) {
    if (error instanceof fee.errors.KeyResolutionError && error.cause instanceof Error) throw error.cause
    if (error instanceof fee.errors.AuthenticationError)
      throw new Error('Wrong key, or the file was modified.', { cause: error })
    if (error instanceof fee.errors.InvalidCiphertextLengthError)
      throw new Error('The downloaded file is incomplete. Fetch it again.', { cause: error })
    throw error
  }
}

/** The credentials hold no key for an envelope. Its message is safe to show as is. */
export class KeyAccessError extends Error {
  override name = 'KeyAccessError'
}

export class CredentialAccessError extends KeyAccessError {
  override name = 'CredentialAccessError'
}

/** A saved sharing credential is unusable; the owner wallet may recover access. */
export class ShareCredentialError extends CredentialAccessError {
  override name = 'ShareCredentialError'
}

/** The envelope's owner and group key (both public header labels) when the wallet in use cannot read it. */
export class NotOwnerError extends KeyAccessError {
  override name = 'NotOwnerError'
  constructor(owner: string, groupKeyId: string, held?: string) {
    super(
      held == null
        ? `This file belongs to ${owner} under group key ${groupKeyId}. Connect that wallet to read it.`
        : `This file belongs to ${owner} under group key ${groupKeyId}; ${held}`
    )
  }
}

/**
 * Memory-only cache of owner-derived group keys, keyed `owner/groupKeyId`.
 * Lets one wallet signature serve a whole page session when the stored grant
 * is unusable (expired session, fresh browser). Never persisted: it dies with
 * the tab. Holding root key material in JS memory is the same exposure class
 * as the vaulted grant+session pair, for a shorter lifetime.
 */
export const rememberedOwnerKeys = new Map<string, Uint8Array>()
let ownerKeyGeneration = 0

/** Drop every remembered group key (tests; wallet disconnect). */
export function clearRememberedOwnerKeys(): void {
  ownerKeyGeneration += 1
  for (const key of rememberedOwnerKeys.values()) key.fill(0)
  rememberedOwnerKeys.clear()
}

/** Reject stale derivations before each wallet prompt and after each response. */
export function guardedOwnerSigner(wallet: OwnerSigner, check: () => void): OwnerSigner {
  return {
    address: wallet.address,
    signTypedData: async (args) => {
      check()
      const signature = await wallet.signTypedData(args)
      check()
      return signature
    },
  }
}

export function ownerKeyGuard(signal?: AbortSignal): () => void {
  const generation = ownerKeyGeneration
  return () => {
    signal?.throwIfAborted()
    if (generation !== ownerKeyGeneration) throw new DOMException('Wallet changed during unlock.', 'AbortError')
  }
}

/**
 * FEE key resolver for the owner wallet: signs for the group key the envelope
 * names and derives the piece key from its labels. Signs once when the data
 * set's recorded commitment is supplied, twice without one (Keysmith's
 * determinism check). `signer` may be a getter, called only when an envelope
 * actually needs a key. With `remember`, the derived group key stays in
 * memory so later envelopes under it decrypt without further signatures.
 */
export function ownerKeyResolver(
  signer: OwnerSigner | (() => OwnerSigner | undefined),
  commitment?: string,
  options?: { remember?: boolean; signal?: AbortSignal }
): fee.KeyResolver {
  const check = ownerKeyGuard(options?.signal)
  return async ({ appMetadata }) => {
    check()
    let piece: PieceMetadataView
    try {
      piece = readPieceMetadata(appMetadata)
    } catch (cause) {
      throw new Error('not a Keysmith envelope', { cause })
    }
    const { owner, groupKeyId } = piece
    const wallet = typeof signer === 'function' ? signer() : signer
    if (wallet == null || owner == null || owner.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new NotOwnerError(
        String(owner),
        groupKeyId,
        wallet == null ? undefined : `the connected wallet is ${wallet.address.toLowerCase()}`
      )
    }
    const cacheKey = `${owner.toLowerCase()}/${groupKeyId}`
    const remembered = options?.remember ? rememberedOwnerKeys.get(cacheKey) : undefined
    if (remembered) return keyForEnvelope(remembered, appMetadata)
    const keys = await deriveGroupKey(
      guardedOwnerSigner(wallet, check),
      { owner: wallet.address, groupKeyId },
      commitment == null ? {} : { commitment }
    )
    let retained = false
    try {
      check()
      const key = keyForEnvelope(keys.groupKey, appMetadata)
      if (options?.remember) {
        rememberedOwnerKeys.set(cacheKey, keys.groupKey)
        retained = true
      }
      return key
    } finally {
      if (!retained) keys.groupKey.fill(0)
    }
  }
}

/** The v1 share-link viewer Drive links open in. */
export const DEFAULT_VIEWER_URL = 'https://viewer.filecoin.cloud/'

/** Who signs for a share: this browser's session grant, or the owner wallet directly. */
export type ShareSender =
  | { sessionPrivateKey: Hex; credential: EncryptionCredential }
  | { signer: OwnerSigner; commitment?: string }

/**
 * Mint a filecoin-pin v1 share link for one encrypted upload: the piece key,
 * wrapped to a fresh throwaway key T that travels in the link fragment.
 * Anyone holding the link can decrypt that one upload, forever — share links
 * cannot be revoked. Nothing in the fragment reaches a server.
 *
 * `appMetadata` is the envelope's own header labels (`fee.parse`), which name
 * everything an owner wallet needs: with no usable grant, the key re-derives
 * from a wallet signature (remembered for the page session).
 */
export async function createShareLink(options: {
  sender: ShareSender
  rootCid: string
  appMetadata: Record<string, unknown>
  signal?: AbortSignal
}): Promise<string> {
  const check = ownerKeyGuard(options.signal)
  check()
  const labels = options.appMetadata
  let piece: PieceMetadataView
  try {
    piece = readPieceMetadata(labels)
  } catch (cause) {
    throw new KeyAccessError('This file is not a Keysmith envelope.', { cause })
  }
  const { groupKeyId } = piece
  // An envelope that names no owner belongs to the sender's own group key.
  const owner =
    piece.owner ?? ('credential' in options.sender ? options.sender.credential.owner : options.sender.signer.address)
  const descriptor = grantDescriptor({ owner, groupKeyId }, pieceNode(labels as never))
  let pieceEnvelopeKey: Uint8Array
  if ('credential' in options.sender) {
    let grant: DecodedGrant
    try {
      grant = decodeGrant(base64.baseDecode(options.sender.credential.grant))
      grantDescriptor(grant, grant.node as GrantNode)
    } catch (cause) {
      throw new ShareCredentialError('The saved sharing credential is invalid.', { cause })
    }
    if (
      owner.toLowerCase() !== options.sender.credential.owner.toLowerCase() ||
      !sameGroupKey({ ...piece, owner }, grant)
    )
      throw new ShareCredentialError('The saved sharing credential belongs to another owner or encryption group.')
    let node: Uint8Array
    try {
      node = await unwrapWith(options.sender.sessionPrivateKey, grant)
    } catch (cause) {
      // Keysmith wraps WebCrypto authentication failures; other runtime errors
      // must not turn into an unexpected owner-wallet prompt.
      if (cause instanceof Error && cause.cause instanceof Error && cause.cause.name === 'OperationError')
        throw new ShareCredentialError('The saved sharing credential could not be opened.', { cause })
      throw cause
    }
    try {
      pieceEnvelopeKey = keyForEnvelope(node, labels as never, grant)
    } finally {
      node.fill(0)
    }
  } else {
    const wallet = options.sender.signer
    if (owner.toLowerCase() !== wallet.address.toLowerCase())
      throw new KeyAccessError(`This file belongs to ${owner}, not ${wallet.address.toLowerCase()}.`)
    const cacheKey = `${owner.toLowerCase()}/${groupKeyId}`
    let node = rememberedOwnerKeys.get(cacheKey)
    if (node == null) {
      const keys = await deriveGroupKey(
        guardedOwnerSigner(wallet, check),
        { owner: wallet.address, groupKeyId },
        options.sender.commitment == null ? {} : { commitment: options.sender.commitment }
      )
      try {
        check()
        rememberedOwnerKeys.set(cacheKey, keys.groupKey)
        node = keys.groupKey
      } catch (cause) {
        keys.groupKey.fill(0)
        throw cause
      }
    }
    pieceEnvelopeKey = keyForEnvelope(node, labels as never)
  }
  const throwaway = generatePrivateKey()
  let payload: Uint8Array
  try {
    payload = encodeGrant(await wrapTo(publicKeyOf(throwaway), pieceEnvelopeKey, descriptor))
  } finally {
    pieceEnvelopeKey.fill(0)
  }
  check()
  return `${DEFAULT_VIEWER_URL}#v1/${options.rootCid}&d=${base64url.baseEncode(payload)}&k=fak1_${base64url.baseEncode(hexToBytes(throwaway))}`
}
