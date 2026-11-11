// @vitest-environment node

import { decodeGrant, keyForEnvelope, unwrapWith } from '@filoz/keysmith'
import * as fee from 'filecoin-encryption-envelope'
import { base64url } from 'multiformats/bases/base64'
import { bytesToHex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it, vi } from 'vitest'
import {
  clearRememberedOwnerKeys,
  createShareLink,
  DEFAULT_SHARE_VIEWER_URL,
  decryptEnvelope,
  defaultGroupKeyId,
  encryptCar,
  grantKeyResolver,
  isEncryptionEnvelope,
  issueEncryptionCredential,
  NotOwnerError,
  type OwnerSigner,
  oldestValidGroupKey,
  ownerKeyResolver,
} from './encryption.ts'

const OWNER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const

function ownerSigner(): OwnerSigner & { signatures: () => number } {
  const account = privateKeyToAccount(OWNER_PRIVATE_KEY)
  const signTypedData = vi.fn((args: Parameters<typeof account.signTypedData>[0]) => account.signTypedData(args))
  return {
    address: account.address,
    signTypedData: signTypedData as never,
    signatures: () => signTypedData.mock.calls.length,
  }
}

// A tiny but real CAR: header + one raw block, enough to round-trip byte-exact.
const innerCar = new Uint8Array([
  0x38, 0xa2, 0x65, 0x72, 0x6f, 0x6f, 0x74, 0x73, 0x80, 0x67, 0x76, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e, 0x01, 0x05,
  0x01, 0x55, 0x00, 0x68, 0x69,
])

describe('defaultGroupKeyId', () => {
  // Pinned against filecoin-pin@2.3.0 dist/common/group-key.js (the reference
  // implementation this module ports), so Drive and the CLI derive the same id.
  it('matches the filecoin-pin reference vector', () => {
    expect(defaultGroupKeyId('0x44f08D1beFe61255b3C3A349C392C560FA333759')).toBe('0xab566febbb68e6912f90d87558733351')
    expect(defaultGroupKeyId('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')).toBe('0x02ca08cf7e0222c8432adc159232b7eb')
  })

  it('is case-insensitive over the owner address', () => {
    expect(defaultGroupKeyId('0x44f08d1befe61255b3c3a349c392c560fa333759')).toBe('0xab566febbb68e6912f90d87558733351')
  })

  it('rejects non-addresses', () => {
    expect(() => defaultGroupKeyId('0x1234' as never)).toThrow()
  })
})

describe('oldestValidGroupKey', () => {
  const valid = (dataSetId: bigint, groupKeyId: string, commitment: string, version = '1') => ({
    dataSetId,
    metadata: { 'foc/ks': groupKeyId, 'foc/kc': commitment, 'foc/enc': version },
  })
  const idA = `0x${'a'.repeat(32)}`
  const idB = `0x${'b'.repeat(32)}`

  it('returns undefined when no data set records a group key', () => {
    expect(oldestValidGroupKey([{ dataSetId: 1n, metadata: { source: 'filecoin-drive' } }])).toBeUndefined()
    expect(oldestValidGroupKey([])).toBeUndefined()
  })

  it('picks the group key holding the lowest data set id', () => {
    const chosen = oldestValidGroupKey([valid(7n, idB, 'v1.b1'), valid(3n, idA, 'v1.a1'), valid(9n, idA, 'v1.a1')])
    expect(chosen).toEqual({ groupKeyId: idA, commitment: 'v1.a1' })
  })

  it('skips group keys whose data sets disagree on the commitment', () => {
    const chosen = oldestValidGroupKey([
      valid(1n, idA, 'v1.a1'),
      valid(2n, idA, 'v1.DIFFERENT'),
      valid(5n, idB, 'v1.b1'),
    ])
    expect(chosen).toEqual({ groupKeyId: idB, commitment: 'v1.b1' })
  })

  it('skips group keys with a non-canonical id or a foreign foc/enc version', () => {
    expect(oldestValidGroupKey([valid(1n, '0xNOTHEX', 'v1.x')])).toBeUndefined()
    expect(oldestValidGroupKey([valid(1n, idA.toUpperCase().replace('0X', '0x'), 'v1.x')])).toBeUndefined()
    expect(oldestValidGroupKey([valid(1n, idA, 'v1.a1', '2')])).toBeUndefined()
  })
})

describe('issueEncryptionCredential', () => {
  it('derives the default group key with 2 signatures and wraps it to the session key', async () => {
    const signer = ownerSigner()
    const credential = await issueEncryptionCredential(signer, generatePrivateKey())
    expect(credential.groupKeyId).toBe(defaultGroupKeyId(signer.address))
    expect(credential.commitment).toMatch(/^v1\.[0-9a-f]{32}$/)
    expect(credential.owner).toBe(signer.address.toLowerCase())
    expect(credential.grant.length).toBeGreaterThan(0)
    // New group key: keysmith signs twice to check the wallet signs deterministically.
    expect(signer.signatures()).toBe(2)
  })

  it('derives a recorded group key with 1 signature and verifies its commitment', async () => {
    const signer = ownerSigner()
    const first = await issueEncryptionCredential(signer, generatePrivateKey())
    const again = ownerSigner()
    const credential = await issueEncryptionCredential(again, generatePrivateKey(), {
      groupKeyId: first.groupKeyId,
      commitment: first.commitment,
    })
    expect(again.signatures()).toBe(1)
    expect(credential.commitment).toBe(first.commitment)
  })

  it('refuses a recorded commitment that does not match the derived key', async () => {
    const signer = ownerSigner()
    await expect(
      issueEncryptionCredential(signer, generatePrivateKey(), {
        groupKeyId: defaultGroupKeyId(signer.address),
        commitment: `v1.${'0'.repeat(32)}`,
      })
    ).rejects.toThrow()
  })
})

describe('encryptCar / decryptEnvelope', () => {
  async function setup() {
    const signer = ownerSigner()
    const sessionPrivateKey = generatePrivateKey()
    const credential = await issueEncryptionCredential(signer, sessionPrivateKey)
    return { signer, sessionPrivateKey, credential }
  }

  it('round-trips a CAR byte-exact through the session grant', async () => {
    const { sessionPrivateKey, credential } = await setup()
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCar)
    expect(envelope).not.toEqual(innerCar)
    const plaintext = await decryptEnvelope(envelope, grantKeyResolver(sessionPrivateKey, credential))
    expect(plaintext).toEqual(innerCar)
  })

  it('produces a fresh ciphertext per upload (new salt, new key)', async () => {
    const { sessionPrivateKey, credential } = await setup()
    const first = await encryptCar(sessionPrivateKey, credential, innerCar)
    const second = await encryptCar(sessionPrivateKey, credential, innerCar)
    expect(first).not.toEqual(second)
  })

  it('writes the envelope header the share viewer and CLI gate on: chunked CAR with plaintextLength', async () => {
    const { sessionPrivateKey, credential } = await setup()
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCar)
    const info = await fee.parse(envelope)
    if (info.scheme !== 'chunked') throw new Error(`expected a chunked envelope, got ${info.scheme}`)
    expect(info.contentType).toBe('application/vnd.ipld.car')
    expect(Number(info.params.plaintextLength)).toBe(innerCar.length)
  })

  it('detects envelopes and rejects plain bytes', async () => {
    const { sessionPrivateKey, credential } = await setup()
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCar)
    expect(await isEncryptionEnvelope(envelope)).toBe(true)
    expect(await isEncryptionEnvelope(innerCar)).toBe(false)
  })

  it('refuses to decrypt with a different session key than the grant was wrapped to', async () => {
    const { sessionPrivateKey, credential } = await setup()
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCar)
    await expect(decryptEnvelope(envelope, grantKeyResolver(generatePrivateKey(), credential))).rejects.toThrow()
  })

  it('surfaces tampering as an authentication failure', async () => {
    const { sessionPrivateKey, credential } = await setup()
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCar)
    envelope[envelope.length - 1] ^= 0xff
    await expect(decryptEnvelope(envelope, grantKeyResolver(sessionPrivateKey, credential))).rejects.toThrow(
      /modified|authentication/i
    )
  })
})

describe('ownerKeyResolver (root-wallet fallback)', () => {
  async function encrypted() {
    const signer = ownerSigner()
    const sessionPrivateKey = generatePrivateKey()
    const credential = await issueEncryptionCredential(signer, sessionPrivateKey)
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCar)
    return { credential, envelope }
  }

  it('decrypts with the owner wallet alone, 2 signatures without a commitment', async () => {
    const { envelope } = await encrypted()
    const wallet = ownerSigner()
    const plaintext = await decryptEnvelope(envelope, ownerKeyResolver(wallet))
    expect(plaintext).toEqual(innerCar)
    expect(wallet.signatures()).toBe(2)
  })

  it('decrypts with 1 signature when the commitment is known', async () => {
    const { credential, envelope } = await encrypted()
    const wallet = ownerSigner()
    const plaintext = await decryptEnvelope(envelope, ownerKeyResolver(wallet, credential.commitment))
    expect(plaintext).toEqual(innerCar)
    expect(wallet.signatures()).toBe(1)
  })

  it('names the owning address when a different wallet tries', async () => {
    const { envelope } = await encrypted()
    const stranger = privateKeyToAccount(generatePrivateKey())
    const owner = privateKeyToAccount(OWNER_PRIVATE_KEY).address.toLowerCase()
    await expect(
      decryptEnvelope(envelope, ownerKeyResolver({ address: stranger.address, signTypedData: stranger.signTypedData }))
    ).rejects.toThrow(new RegExp(owner))
  })

  it('reports a missing wallet as a NotOwnerError', async () => {
    const { envelope } = await encrypted()
    await expect(
      decryptEnvelope(
        envelope,
        ownerKeyResolver(() => undefined)
      )
    ).rejects.toThrow(NotOwnerError)
  })

  it('remembers the derived key in memory so one signature serves the whole page session', async () => {
    clearRememberedOwnerKeys()
    const first = await encrypted()
    const second = await encrypted()
    const wallet = ownerSigner()
    expect(
      await decryptEnvelope(first.envelope, ownerKeyResolver(wallet, first.credential.commitment, { remember: true }))
    ).toEqual(innerCar)
    expect(wallet.signatures()).toBe(1)
    // Same group key, different envelope/salt: no further prompts.
    expect(await decryptEnvelope(second.envelope, ownerKeyResolver(wallet, undefined, { remember: true }))).toEqual(
      innerCar
    )
    expect(wallet.signatures()).toBe(1)
    // Without remember, derivation stays one-shot and signs again.
    expect(await decryptEnvelope(first.envelope, ownerKeyResolver(wallet, first.credential.commitment))).toEqual(
      innerCar
    )
    expect(wallet.signatures()).toBe(2)
    clearRememberedOwnerKeys()
    expect(
      await decryptEnvelope(first.envelope, ownerKeyResolver(wallet, first.credential.commitment, { remember: true }))
    ).toEqual(innerCar)
    expect(wallet.signatures()).toBe(3)
    clearRememberedOwnerKeys()
  })
})

describe('cancelled owner derivations', () => {
  it.each(['abort first', 'abort last', 'wallet first', 'wallet last'] as const)(
    'does not continue signing or cache keys after %s',
    async (mode) => {
      clearRememberedOwnerKeys()
      const privateKey = generatePrivateKey()
      const credential = await issueEncryptionCredential(ownerSigner(), privateKey)
      const envelope = await encryptCar(privateKey, credential, innerCar)
      const controller = new AbortController()
      const wallet = ownerSigner()
      const stopAt = mode.endsWith('first') ? 1 : 2
      const guarded: OwnerSigner = {
        address: wallet.address,
        signTypedData: async (args) => {
          const result = await wallet.signTypedData(args)
          if (wallet.signatures() === stopAt) {
            if (mode.startsWith('abort')) controller.abort()
            else clearRememberedOwnerKeys()
          }
          return result
        },
      }
      await expect(
        decryptEnvelope(
          envelope,
          ownerKeyResolver(guarded, undefined, {
            remember: true,
            signal: controller.signal,
          })
        )
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(wallet.signatures()).toBe(stopAt)
      // No cancelled key remains in the page cache: a fresh owner must sign again.
      const fresh = ownerSigner()
      expect(
        await decryptEnvelope(envelope, ownerKeyResolver(fresh, credential.commitment, { remember: true }))
      ).toEqual(innerCar)
      expect(fresh.signatures()).toBe(1)
      clearRememberedOwnerKeys()
    }
  )

  it('does not prompt when the task is already aborted', async () => {
    const privateKey = generatePrivateKey()
    const credential = await issueEncryptionCredential(ownerSigner(), privateKey)
    const envelope = await encryptCar(privateKey, credential, innerCar)
    const controller = new AbortController()
    controller.abort()
    const wallet = ownerSigner()
    await expect(
      decryptEnvelope(
        envelope,
        ownerKeyResolver(wallet, undefined, {
          remember: true,
          signal: controller.signal,
        })
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(wallet.signatures()).toBe(0)
  })
})

describe('createShareLink', () => {
  const rootCid = 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe'

  async function shared() {
    const signer = ownerSigner()
    const sessionPrivateKey = generatePrivateKey()
    const credential = await issueEncryptionCredential(signer, sessionPrivateKey)
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCar)
    const info = await fee.parse(envelope)
    const appMetadata = info.appMetadata as Record<string, unknown>
    const link = await createShareLink({ sender: { sessionPrivateKey, credential }, rootCid, appMetadata })
    return { sessionPrivateKey, credential, envelope, appMetadata, link }
  }

  it.each([1, 2])('discards an owner share when the wallet changes after signature %s', async (stopAt) => {
    clearRememberedOwnerKeys()
    const { appMetadata } = await shared()
    const wallet = ownerSigner()
    const signer: OwnerSigner = {
      address: wallet.address,
      signTypedData: async (args) => {
        const signature = await wallet.signTypedData(args)
        if (wallet.signatures() === stopAt) clearRememberedOwnerKeys()
        return signature
      },
    }
    await expect(createShareLink({ sender: { signer }, rootCid, appMetadata })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(wallet.signatures()).toBe(stopAt)
    const fresh = ownerSigner()
    await expect(createShareLink({ sender: { signer: fresh }, rootCid, appMetadata })).resolves.toContain('#v1/')
    expect(fresh.signatures()).toBe(2)
    clearRememberedOwnerKeys()
  })

  it('stops an aborted viewer authorization before a second signature or key-cache write', async () => {
    clearRememberedOwnerKeys()
    const { appMetadata } = await shared()
    const controller = new AbortController()
    const wallet = ownerSigner()
    const signer: OwnerSigner = {
      address: wallet.address,
      signTypedData: async (args) => {
        const signature = await wallet.signTypedData(args)
        controller.abort()
        return signature
      },
    }
    await expect(
      createShareLink({ sender: { signer }, rootCid, appMetadata, signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(wallet.signatures()).toBe(1)
    const fresh = ownerSigner()
    await createShareLink({ sender: { signer: fresh }, rootCid, appMetadata })
    expect(fresh.signatures()).toBe(2)
    clearRememberedOwnerKeys()
  })

  it('mints a filecoin-pin v1 share link whose fragment alone opens the upload', async () => {
    const { envelope, appMetadata, link } = await shared()
    // Wire format: <viewer>#v1/<rootCid>&d=<b64url grant>&k=fak1_<b64url T>.
    expect(link.startsWith(`${DEFAULT_SHARE_VIEWER_URL}#v1/${rootCid}&d=`)).toBe(true)
    const [, fragment] = link.split('#')
    const params = Object.fromEntries(
      fragment
        .slice(`v1/${rootCid}&`.length)
        .split('&')
        .map((part) => part.split('=') as [string, string])
    )
    expect(params.k.startsWith('fak1_')).toBe(true)
    // Recipient side, exactly as filecoin-pin's shareKeyResolver opens it:
    const T = bytesToHex(base64url.baseDecode(params.k.slice('fak1_'.length)))
    const grant = decodeGrant(base64url.baseDecode(params.d))
    const key = await unwrapWith(T, grant)
    const plaintext = await decryptEnvelope(envelope, () => keyForEnvelope(key, appMetadata as never, grant))
    expect(plaintext).toEqual(innerCar)
  })

  it('binds the share to one upload: another envelope of the same owner stays closed', async () => {
    const { sessionPrivateKey, credential, appMetadata: shareLabels, link } = await shared()
    const other = await encryptCar(sessionPrivateKey, credential, innerCar)
    const otherInfo = await fee.parse(other)
    const [, fragment] = link.split('#')
    const params = Object.fromEntries(
      fragment
        .slice(`v1/${rootCid}&`.length)
        .split('&')
        .map((part) => part.split('=') as [string, string])
    )
    const T = bytesToHex(base64url.baseDecode(params.k.slice('fak1_'.length)))
    const grant = decodeGrant(base64url.baseDecode(params.d))
    const key = await unwrapWith(T, grant)
    // Same piece: opens. Different piece (fresh salt): refused by keyForEnvelope.
    expect(() => keyForEnvelope(key, shareLabels as never, grant)).not.toThrow()
    expect(() => keyForEnvelope(key, otherInfo.appMetadata as never, grant)).toThrow()
  })

  it('mints the same openable link from the owner wallet alone, no grant involved', async () => {
    clearRememberedOwnerKeys()
    const issuer = ownerSigner()
    const sessionPrivateKey = generatePrivateKey()
    const credential = await issueEncryptionCredential(issuer, sessionPrivateKey)
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCar)
    const info = await fee.parse(envelope)
    const appMetadata = info.appMetadata as Record<string, unknown>
    const wallet = ownerSigner()
    const link = await createShareLink({
      sender: { signer: wallet, commitment: credential.commitment },
      rootCid,
      appMetadata,
    })
    expect(wallet.signatures()).toBe(1)
    const [, fragment] = link.split('#')
    const params = Object.fromEntries(
      fragment
        .slice(`v1/${rootCid}&`.length)
        .split('&')
        .map((part) => part.split('=') as [string, string])
    )
    const T = bytesToHex(base64url.baseDecode(params.k.slice('fak1_'.length)))
    const grant = decodeGrant(base64url.baseDecode(params.d))
    const key = await unwrapWith(T, grant)
    const plaintext = await decryptEnvelope(envelope, () => keyForEnvelope(key, appMetadata as never, grant))
    expect(plaintext).toEqual(innerCar)
    // The derivation is remembered: a second owner-mode share signs nothing.
    await createShareLink({ sender: { signer: wallet }, rootCid, appMetadata })
    expect(wallet.signatures()).toBe(1)
    clearRememberedOwnerKeys()
  })

  it('refuses an owner-mode share from a wallet that does not own the piece', async () => {
    const issuer = ownerSigner()
    const sessionPrivateKey = generatePrivateKey()
    const credential = await issueEncryptionCredential(issuer, sessionPrivateKey)
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCar)
    const info = await fee.parse(envelope)
    const stranger = privateKeyToAccount(generatePrivateKey())
    await expect(
      createShareLink({
        sender: { signer: { address: stranger.address, signTypedData: stranger.signTypedData as never } },
        rootCid,
        appMetadata: info.appMetadata as Record<string, unknown>,
      })
    ).rejects.toThrow(/belongs to/)
  })
})
