/**
 * Keysmith encryption for Drive uploads, following filecoin-pin's conventions so
 * the CLI and Drive read each other's data: a Keysmith *keyspace* is a **group
 * key**, data sets carrying encrypted pieces are tagged `foc/enc`/`foc/ks`/`foc/kc`,
 * and every envelope names its own group key and salt.
 *
 * Ported from filecoin-pin@2.3.0 `dist/common/group-key.js`, which the package
 * builds but does not export. Delete this once filecoin-pin exports its
 * browser-safe encryption modules.
 */
import {
  COMMITMENT_KEY,
  decodeGrant,
  encodeGrant,
  type GrantNode,
  grantDescriptor,
  KEYSPACE_ID_KEY,
  keyForEnvelope,
  keyspaceKeys,
  newSalt,
  pieceKey,
  pieceMetadata,
  pieceNode,
  publicKeyOf,
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

/** A wallet that can sign for a group key (Keysmith's `KeyspaceKey` message): the owner's own key, never a session key. */
export type OwnerSigner = TypedDataSigner & { address: Address }

/** Data set metadata key that marks a data set as encrypted and versions its rules. */
export const ENCRYPTION_VERSION_KEY = 'foc/enc'
/** The only `foc/enc` value this version writes and reuses. */
export const ENCRYPTION_VERSION = '1'
export const GROUP_KEY_ID_KEY = KEYSPACE_ID_KEY
export const GROUP_KEY_COMMITMENT_KEY = COMMITMENT_KEY
/** Keys that mark a data set as encrypted; a plain upload never reuses a data set carrying any of them. */
export const ENCRYPTED_DATA_SET_KEYS: readonly string[] = [
  GROUP_KEY_ID_KEY,
  GROUP_KEY_COMMITMENT_KEY,
  ENCRYPTION_VERSION_KEY,
]

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
 * "Oldest wins": group data sets by `foc/ks`, skip any group key whose id is not
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
  const keys = await keyspaceKeys(
    signer,
    { owner: signer.address, keyspace: groupKeyId },
    recorded == null ? {} : { commitment: recorded.commitment }
  )
  try {
    const grant = await wrapTo(publicKeyOf(sessionPrivateKey), keys.kk, keys.descriptor)
    return {
      grant: base64.baseEncode(encodeGrant(grant)),
      groupKeyId,
      commitment: keys.commitment,
      owner: signer.address.toLowerCase() as Address,
    }
  } finally {
    keys.kk.fill(0)
  }
}

/** The `foc/*` keys every data set holding this credential's pieces must carry (set at creation, immutable after). */
export function encryptedDataSetMetadata(credential: EncryptionCredential): Record<string, string> {
  return {
    [ENCRYPTION_VERSION_KEY]: ENCRYPTION_VERSION,
    [GROUP_KEY_ID_KEY]: credential.groupKeyId,
    [GROUP_KEY_COMMITMENT_KEY]: credential.commitment,
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
  const grant = decodeGrant(base64.baseDecode(credential.grant))
  const node = await unwrapWith(sessionPrivateKey, grant)
  try {
    const salt = newSalt()
    const cek = pieceKey(node, salt)
    const appMetadata = pieceMetadata({ owner: credential.owner, keyspace: credential.groupKeyId }, { salt })
    try {
      // fee.encrypt()'s stream imports cek lazily on its first pull(), copying
      // it into an opaque CryptoKey; safe to wipe only once the stream (fully
      // drained below) has actually started and consumed it.
      return await throughStream(innerCar, {
        ...fee.encrypt({ cek, appMetadata, contentLength: innerCar.byteLength, contentType: CAR_CONTENT_TYPE }),
      })
    } finally {
      cek.fill(0)
    }
  } finally {
    node.fill(0)
  }
}

/** True when the bytes parse as an FEE envelope; plain CARs and junk return false. */
export async function isEncryptionEnvelope(bytes: Uint8Array): Promise<boolean> {
  try {
    await fee.parse(bytes)
    return true
  } catch {
    return false
  }
}

/**
 * FEE key resolver for the browser grant: opens the grant with the session key
 * and derives the piece key, validating the envelope's owner and group key
 * against the grant.
 */
export function grantKeyResolver(sessionPrivateKey: Hex, credential: EncryptionCredential): fee.KeyResolver {
  return async ({ appMetadata }) => {
    const grant = decodeGrant(base64.baseDecode(credential.grant))
    const node = await unwrapWith(sessionPrivateKey, grant)
    try {
      return keyForEnvelope(node, appMetadata, grant)
    } finally {
      node.fill(0)
    }
  }
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

/** A saved sharing credential is unusable; the owner wallet may recover access. */
export class ShareCredentialError extends KeyAccessError {
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
 * Memory-only cache of owner-derived group keys, keyed `owner/keyspace`.
 * Lets one wallet signature serve a whole page session when the stored grant
 * is unusable (expired session, fresh browser). Never persisted: it dies with
 * the tab. Holding root key material in JS memory is the same exposure class
 * as the vaulted grant+session pair, for a shorter lifetime.
 */
const rememberedOwnerKeys = new Map<string, Uint8Array>()
let ownerKeyGeneration = 0

/** Drop every remembered group key (tests; wallet disconnect). */
export function clearRememberedOwnerKeys(): void {
  ownerKeyGeneration += 1
  for (const key of rememberedOwnerKeys.values()) key.fill(0)
  rememberedOwnerKeys.clear()
}

/** Reject stale derivations before each wallet prompt and after each response. */
function guardedOwnerSigner(wallet: OwnerSigner, check: () => void): OwnerSigner {
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

function ownerKeyGuard(signal?: AbortSignal): () => void {
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
    const groupKeyId = appMetadata?.['foc/ks']
    if (appMetadata?.['foc/v'] !== 1 || typeof groupKeyId !== 'string') throw new Error('not a Keysmith envelope')
    const owner = appMetadata['foc/own']
    const wallet = typeof signer === 'function' ? signer() : signer
    if (wallet == null || typeof owner !== 'string' || owner.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new NotOwnerError(
        String(owner),
        groupKeyId,
        wallet == null ? undefined : `the connected wallet is ${wallet.address.toLowerCase()}`
      )
    }
    const cacheKey = `${owner.toLowerCase()}/${groupKeyId}`
    const remembered = options?.remember ? rememberedOwnerKeys.get(cacheKey) : undefined
    if (remembered) return keyForEnvelope(remembered, appMetadata)
    const keys = await keyspaceKeys(
      guardedOwnerSigner(wallet, check),
      { owner: wallet.address, keyspace: groupKeyId as Hex },
      commitment == null ? {} : { commitment }
    )
    let retained = false
    try {
      check()
      const key = keyForEnvelope(keys.kk, appMetadata)
      if (options?.remember) {
        rememberedOwnerKeys.set(cacheKey, keys.kk)
        retained = true
      }
      return key
    } finally {
      if (!retained) keys.kk.fill(0)
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
  const owner = labels['foc/own']
  const keyspace = labels['foc/ks']
  if (labels['foc/v'] !== 1 || typeof owner !== 'string' || typeof keyspace !== 'string')
    throw new KeyAccessError('This file is not a Keysmith envelope.')
  const descriptor = grantDescriptor({ owner: owner as Address, keyspace: keyspace as Hex }, pieceNode(labels as never))
  let pieceEnvelopeKey: Uint8Array
  if ('credential' in options.sender) {
    let grant: ReturnType<typeof decodeGrant>
    try {
      grant = decodeGrant(base64.baseDecode(options.sender.credential.grant))
      grantDescriptor({ owner: grant.owner, keyspace: grant.keyspace }, grant.node as GrantNode)
    } catch (cause) {
      throw new ShareCredentialError('The saved sharing credential is invalid.', { cause })
    }
    if (
      owner.toLowerCase() !== options.sender.credential.owner.toLowerCase() ||
      owner.toLowerCase() !== grant.owner.toLowerCase() ||
      keyspace.toLowerCase() !== grant.keyspace.toLowerCase()
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
    const cacheKey = `${owner.toLowerCase()}/${keyspace}`
    let node = rememberedOwnerKeys.get(cacheKey)
    if (node == null) {
      const keys = await keyspaceKeys(
        guardedOwnerSigner(wallet, check),
        { owner: wallet.address, keyspace: keyspace as Hex },
        options.sender.commitment == null ? {} : { commitment: options.sender.commitment }
      )
      try {
        check()
        rememberedOwnerKeys.set(cacheKey, keys.kk)
        node = keys.kk
      } catch (cause) {
        keys.kk.fill(0)
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
