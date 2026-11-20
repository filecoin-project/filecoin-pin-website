// @vitest-environment node

import { decodeGrant, keyForEnvelope, unwrapWith } from '@filoz/keysmith-v1'
import * as fee from 'filecoin-encryption-envelope'
import { base64url } from 'multiformats/bases/base64'
import { bytesToHex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CredentialAccessError,
  clearRememberedOwnerKeys,
  createShareLink as createCurrentShareLink,
  grantKeyResolver as currentGrantKeyResolver,
  ownerKeyResolver as currentOwnerKeyResolver,
  DEFAULT_VIEWER_URL,
  decryptEnvelope,
  encryptCar,
  issueEncryptionCredential,
  NotOwnerError,
  type OwnerSigner,
} from './encryption.ts'
import { encryptLegacyCar, issueLegacyCredential } from './encryption-v1.test-helpers.ts'
import {
  createShareLink,
  grantKeyResolver,
  isLegacyCredential,
  isLegacyEnvelope,
  ownerKeyResolver,
} from './encryption-v1.ts'

const OWNER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const rootCid = 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe'
const innerCar = new Uint8Array([
  0x38, 0xa2, 0x65, 0x72, 0x6f, 0x6f, 0x74, 0x73, 0x80, 0x67, 0x76, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e, 0x01, 0x05,
  0x01, 0x55, 0x00, 0x68, 0x69,
])

function ownerSigner(): OwnerSigner & { signatures: () => number; primaryTypes: () => string[] } {
  const account = privateKeyToAccount(OWNER_PRIVATE_KEY)
  const signTypedData = vi.fn((args: Parameters<typeof account.signTypedData>[0]) => account.signTypedData(args))
  return {
    address: account.address,
    signTypedData: signTypedData as never,
    signatures: () => signTypedData.mock.calls.length,
    primaryTypes: () => signTypedData.mock.calls.map(([args]) => String(args.primaryType)),
  }
}

/** An upload as keysmith 0.1.0 wrote it, with the browser credential of that time. */
async function legacyUpload() {
  const sessionPrivateKey = generatePrivateKey()
  const { credential, groupKey } = await issueLegacyCredential(ownerSigner(), sessionPrivateKey)
  const envelope = await encryptLegacyCar(groupKey, credential, innerCar)
  const appMetadata = (await fee.parse(envelope)).appMetadata as Record<string, unknown>
  return { sessionPrivateKey, credential, envelope, appMetadata }
}

afterEach(() => clearRememberedOwnerKeys())

describe('format detection', () => {
  it('recognises keysmith 0.1.0 envelopes and credentials, and nothing newer', async () => {
    const legacy = await legacyUpload()
    expect(legacy.appMetadata).toMatchObject({ 'foc/v': 1, 'foc/ks': legacy.credential.groupKeyId })
    expect(isLegacyEnvelope(legacy.appMetadata)).toBe(true)
    expect(isLegacyCredential(legacy.credential)).toBe(true)

    const sessionPrivateKey = generatePrivateKey()
    const credential = await issueEncryptionCredential(ownerSigner(), sessionPrivateKey)
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCar)
    expect(isLegacyEnvelope((await fee.parse(envelope)).appMetadata)).toBe(false)
    expect(isLegacyCredential(credential)).toBe(false)
    expect(isLegacyEnvelope(undefined)).toBe(false)
  })

  it('keeps the two formats apart: neither code path opens the other format', async () => {
    const legacy = await legacyUpload()
    const sessionPrivateKey = generatePrivateKey()
    const credential = await issueEncryptionCredential(ownerSigner(), sessionPrivateKey)
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCar)
    // The current code refuses a format 1 envelope and a format 1 credential.
    await expect(
      decryptEnvelope(legacy.envelope, currentGrantKeyResolver(legacy.sessionPrivateKey, legacy.credential))
    ).rejects.toThrow(CredentialAccessError)
    await expect(decryptEnvelope(legacy.envelope, currentOwnerKeyResolver(ownerSigner()))).rejects.toThrow(
      /not a Keysmith envelope/
    )
    await expect(
      createCurrentShareLink({ sender: { signer: ownerSigner() }, rootCid, appMetadata: legacy.appMetadata })
    ).rejects.toThrow(/not a Keysmith envelope/)
    // The legacy code refuses a format 2 envelope.
    await expect(decryptEnvelope(envelope, ownerKeyResolver(ownerSigner()))).rejects.toThrow(/not a Keysmith envelope/)
  })
})

describe('grantKeyResolver (format 1)', () => {
  it('opens an old upload silently with the legacy credential', async () => {
    const { sessionPrivateKey, credential, envelope } = await legacyUpload()
    expect(await decryptEnvelope(envelope, grantKeyResolver(sessionPrivateKey, credential))).toEqual(innerCar)
  })

  it('reports a credential wrapped to another session key as unusable', async () => {
    const { credential, envelope } = await legacyUpload()
    await expect(decryptEnvelope(envelope, grantKeyResolver(generatePrivateKey(), credential))).rejects.toThrow(
      CredentialAccessError
    )
  })

  it('reports a malformed credential as unusable', async () => {
    const { sessionPrivateKey, credential, envelope } = await legacyUpload()
    await expect(
      decryptEnvelope(envelope, grantKeyResolver(sessionPrivateKey, { ...credential, grant: 'AAAA' }))
    ).rejects.toThrow(CredentialAccessError)
  })
})

describe('ownerKeyResolver (format 1)', () => {
  it('asks the owner to sign the keysmith 0.1.0 message: twice without a commitment, once with it', async () => {
    const { credential, envelope } = await legacyUpload()
    const fresh = ownerSigner()
    expect(await decryptEnvelope(envelope, ownerKeyResolver(fresh))).toEqual(innerCar)
    expect(fresh.primaryTypes()).toEqual(['KeyspaceKey', 'KeyspaceKey'])
    const known = ownerSigner()
    expect(await decryptEnvelope(envelope, ownerKeyResolver(known, credential.commitment))).toEqual(innerCar)
    expect(known.signatures()).toBe(1)
  })

  it('names the owner when another wallet, or none, tries', async () => {
    const { envelope } = await legacyUpload()
    const stranger = privateKeyToAccount(generatePrivateKey())
    const owner = privateKeyToAccount(OWNER_PRIVATE_KEY).address.toLowerCase()
    await expect(
      decryptEnvelope(
        envelope,
        ownerKeyResolver({ address: stranger.address, signTypedData: stranger.signTypedData as never })
      )
    ).rejects.toThrow(new RegExp(owner))
    await expect(
      decryptEnvelope(
        envelope,
        ownerKeyResolver(() => undefined)
      )
    ).rejects.toThrow(NotOwnerError)
  })

  it('remembers the key for the page session and forgets it when the wallet disconnects', async () => {
    const first = await legacyUpload()
    const second = await legacyUpload()
    const wallet = ownerSigner()
    const options = { remember: true }
    expect(
      await decryptEnvelope(first.envelope, ownerKeyResolver(wallet, first.credential.commitment, options))
    ).toEqual(innerCar)
    expect(await decryptEnvelope(second.envelope, ownerKeyResolver(wallet, undefined, options))).toEqual(innerCar)
    expect(wallet.signatures()).toBe(1)
    clearRememberedOwnerKeys()
    expect(
      await decryptEnvelope(first.envelope, ownerKeyResolver(wallet, first.credential.commitment, options))
    ).toEqual(innerCar)
    expect(wallet.signatures()).toBe(2)
  })

  it('never reuses a remembered key across formats, though both share the default group key id', async () => {
    const legacy = await legacyUpload()
    const sessionPrivateKey = generatePrivateKey()
    const credential = await issueEncryptionCredential(ownerSigner(), sessionPrivateKey)
    expect(credential.groupKeyId).toBe(legacy.credential.groupKeyId)
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCar)
    const wallet = ownerSigner()
    const options = { remember: true }
    expect(
      await decryptEnvelope(legacy.envelope, ownerKeyResolver(wallet, legacy.credential.commitment, options))
    ).toEqual(innerCar)
    // Same owner, same id, other format: a separate key, so the wallet signs the new message.
    expect(await decryptEnvelope(envelope, currentOwnerKeyResolver(wallet, credential.commitment, options))).toEqual(
      innerCar
    )
    expect(wallet.primaryTypes()).toEqual(['KeyspaceKey', 'GroupKey'])
    // Both stay remembered, each for its own format.
    expect(await decryptEnvelope(legacy.envelope, ownerKeyResolver(wallet, undefined, options))).toEqual(innerCar)
    expect(await decryptEnvelope(envelope, currentOwnerKeyResolver(wallet, undefined, options))).toEqual(innerCar)
    expect(wallet.signatures()).toBe(2)
  })
})

describe('createShareLink (format 1)', () => {
  /** Recipient side: the link fragment alone must open the upload with keysmith 0.1.0. */
  async function open(link: string, envelope: Uint8Array, appMetadata: Record<string, unknown>) {
    expect(link.startsWith(`${DEFAULT_VIEWER_URL}#v1/${rootCid}&d=`)).toBe(true)
    const params = Object.fromEntries(
      link
        .split('#')[1]
        .slice(`v1/${rootCid}&`.length)
        .split('&')
        .map((part) => part.split('=') as [string, string])
    )
    const grant = decodeGrant(base64url.baseDecode(params.d))
    const key = await unwrapWith(bytesToHex(base64url.baseDecode(params.k.slice('fak1_'.length))), grant)
    return decryptEnvelope(envelope, () => keyForEnvelope(key, appMetadata as never, grant))
  }

  it('mints an openable link from the legacy credential, with no wallet prompt', async () => {
    const { sessionPrivateKey, credential, envelope, appMetadata } = await legacyUpload()
    const link = await createShareLink({ sender: { sessionPrivateKey, credential }, rootCid, appMetadata })
    expect(await open(link, envelope, appMetadata)).toEqual(innerCar)
  })

  it('mints the same link from the owner wallet when no legacy credential is stored', async () => {
    const { credential, envelope, appMetadata } = await legacyUpload()
    const wallet = ownerSigner()
    const link = await createShareLink({
      sender: { signer: wallet, commitment: credential.commitment },
      rootCid,
      appMetadata,
    })
    expect(wallet.primaryTypes()).toEqual(['KeyspaceKey'])
    expect(await open(link, envelope, appMetadata)).toEqual(innerCar)
  })

  it('refuses a wallet that does not own the upload', async () => {
    const { appMetadata } = await legacyUpload()
    const stranger = privateKeyToAccount(generatePrivateKey())
    await expect(
      createShareLink({
        sender: { signer: { address: stranger.address, signTypedData: stranger.signTypedData as never } },
        rootCid,
        appMetadata,
      })
    ).rejects.toThrow(/belongs to/)
  })
})
