/**
 * Read-only support for uploads encrypted with keysmith 0.1.0 (format 1:
 * `foc/v` 1, `foc/ks`, `v1.` commitments). Drive writes format 2 only
 * (`encryption.ts`); this module opens and shares what older versions wrote.
 *
 * It is the only importer of `@filoz/keysmith-v1`. To retire format 1, delete
 * this file and its callers in `download.ts`.
 */
import {
  decodeGrant,
  encodeGrant,
  type GrantNode,
  grantDescriptor,
  keyForEnvelope,
  keyspaceKeys,
  pieceNode,
  publicKeyOf,
  type TypedDataSigner,
  unwrapWith,
  wrapTo,
} from '@filoz/keysmith-v1'
import type * as fee from 'filecoin-encryption-envelope'
import { base64, base64url } from 'multiformats/bases/base64'
import type { Address, Hex } from 'viem'
import { hexToBytes } from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import {
  CredentialAccessError,
  DEFAULT_VIEWER_URL,
  type EncryptionCredential,
  guardedOwnerSigner,
  KeyAccessError,
  NotOwnerError,
  type OwnerSigner,
  ownerKeyGuard,
  rememberedOwnerKeys,
  ShareCredentialError,
  type ShareSender,
} from './encryption.ts'

/** Envelope label naming the group key in format 1. */
export const LEGACY_GROUP_KEY_LABEL = 'foc/ks'

/** True for envelope labels written by keysmith 0.1.0. */
export const isLegacyEnvelope = (labels: Record<string, unknown> | undefined): boolean => labels?.['foc/v'] === 1

/** True for a stored credential issued by keysmith 0.1.0: its commitment is `v1.<hex>`. */
export const isLegacyCredential = (credential: Pick<EncryptionCredential, 'commitment'>): boolean =>
  credential.commitment.startsWith('v1.')

/** A wallet signs whichever typed data it is given; only the declared message type differs between formats. */
const legacySigner = (wallet: OwnerSigner) => wallet as unknown as TypedDataSigner & { address: Address }

/** Format 1 and format 2 share the default group key id, so remembered keys are kept apart by format. */
const cacheKeyFor = (owner: string, keyspace: string) => `v1:${owner.toLowerCase()}/${keyspace}`

/**
 * FEE key resolver for a format 1 browser grant: opens the grant with the
 * session key and derives the piece key, validating the envelope's owner and
 * group key against the grant.
 */
export function grantKeyResolver(sessionPrivateKey: Hex, credential: EncryptionCredential): fee.KeyResolver {
  return async ({ appMetadata }) => {
    let grant: ReturnType<typeof decodeGrant>
    try {
      grant = decodeGrant(base64.baseDecode(credential.grant))
      grantDescriptor({ owner: grant.owner, keyspace: grant.keyspace }, grant.node as GrantNode)
    } catch (cause) {
      throw new CredentialAccessError('The saved encryption credential is invalid.', { cause })
    }
    const labels = (appMetadata ?? {}) as Record<string, unknown>
    if (typeof labels['foc/own'] !== 'string' || typeof labels[LEGACY_GROUP_KEY_LABEL] !== 'string')
      throw new KeyAccessError('The encryption envelope has invalid owner or keyspace labels.')
    if (
      labels['foc/own'].toLowerCase() !== grant.owner.toLowerCase() ||
      labels[LEGACY_GROUP_KEY_LABEL].toLowerCase() !== grant.keyspace.toLowerCase()
    )
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

/**
 * FEE key resolver for the owner wallet on a format 1 envelope: signs the
 * keysmith 0.1.0 message for the group key the envelope names. Signs once when
 * the recorded commitment is supplied, twice without one. With `remember`, the
 * derived group key stays in memory for the page session.
 */
export function ownerKeyResolver(
  signer: OwnerSigner | (() => OwnerSigner | undefined),
  commitment?: string,
  options?: { remember?: boolean; signal?: AbortSignal }
): fee.KeyResolver {
  const check = ownerKeyGuard(options?.signal)
  return async ({ appMetadata }) => {
    check()
    const groupKeyId = appMetadata?.[LEGACY_GROUP_KEY_LABEL]
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
    const cacheKey = cacheKeyFor(owner, groupKeyId)
    const remembered = options?.remember ? rememberedOwnerKeys.get(cacheKey) : undefined
    if (remembered) return keyForEnvelope(remembered, appMetadata)
    const keys = await keyspaceKeys(
      legacySigner(guardedOwnerSigner(wallet, check)),
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

/**
 * Mint a share link for one format 1 upload: the piece key, wrapped to a fresh
 * throwaway key that travels in the link fragment. The viewer opens both
 * formats; the link shape is the same.
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
  const keyspace = labels[LEGACY_GROUP_KEY_LABEL]
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
    const cacheKey = cacheKeyFor(owner, keyspace)
    let node = rememberedOwnerKeys.get(cacheKey)
    if (node == null) {
      const keys = await keyspaceKeys(
        legacySigner(guardedOwnerSigner(wallet, check)),
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
