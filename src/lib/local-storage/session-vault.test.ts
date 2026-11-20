import { webcrypto } from 'node:crypto'
import { indexedDB } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadBrowserSession,
  saveBrowserSession,
  subscribeBrowserSession,
  updateBrowserSession,
} from './session-vault.ts'

beforeEach(() => {
  vi.stubGlobal('indexedDB', indexedDB)
  vi.stubGlobal('crypto', webcrypto)
})
afterEach(() => vi.unstubAllGlobals())
describe('browser session vault', () => {
  it('restores an encrypted session only within its wallet and network', async () => {
    const session = { privateKey: `0x${'1'.repeat(64)}` as const, expiresAt: 1800000000 }
    await saveBrowserSession('314:alice', session)
    expect(await loadBrowserSession('314:alice')).toEqual(session)
    expect(await loadBrowserSession('314:bob')).toBeNull()
    expect(await loadBrowserSession('314159:alice')).toBeNull()
    expect(localStorage.length).toBe(0)
    await saveBrowserSession('314:alice', null)
    expect(await loadBrowserSession('314:alice')).toBeNull()
  })

  it('round-trips a session carrying an encryption credential and still loads records without one', async () => {
    const scope = '314:encrypted-wallet'
    const session = {
      privateKey: `0x${'5'.repeat(64)}` as const,
      expiresAt: 1800000000,
      encryption: {
        grant: 'mGrantBytes',
        groupKeyId: `0x${'a'.repeat(32)}` as const,
        commitment: `v2.${'b'.repeat(32)}`,
        owner: '0x44f08d1befe61255b3c3a349c392c560fa333759' as const,
      },
    }
    await saveBrowserSession(scope, session)
    expect(await loadBrowserSession(scope)).toEqual(session)
    await saveBrowserSession(scope, null)
  })

  describe('stored layout shared with builds on keysmith 0.1.0', () => {
    const base = { privateKey: `0x${'6'.repeat(64)}` as const, expiresAt: 1800000000 }
    const legacy = {
      grant: 'mOldGrant',
      groupKeyId: `0x${'a'.repeat(32)}` as const,
      commitment: `v1.${'b'.repeat(32)}`,
      owner: '0x44f08d1befe61255b3c3a349c392c560fa333759' as const,
    }
    const current = { ...legacy, grant: 'mNewGrant', commitment: `v2.${'c'.repeat(32)}` }

    it('loads a record written by an older build with its grant as legacy, never as the current key', async () => {
      const scope = '314:upgraded-wallet'
      await putRaw(scope, { ...base, encryption: legacy })
      expect(await loadBrowserSession(scope)).toEqual({ ...base, legacyEncryption: legacy })
      await saveBrowserSession(scope, null)
    })

    it('stores the current grant beside the legacy one, where an older build never reads it', async () => {
      const scope = '314:both-wallet'
      await putRaw(scope, { ...base, encryption: legacy })
      await updateBrowserSession(scope, (session) => session && { ...session, encryption: current })
      expect(await loadBrowserSession(scope)).toEqual({ ...base, encryption: current, legacyEncryption: legacy })
      // What an older tab, or a rollback, finds: its own grant, untouched.
      expect(await readRaw(scope)).toEqual({ ...base, encryption: legacy, encryption2: current })
      await saveBrowserSession(scope, null)
    })

    it('leaves `encryption` empty for a wallet set up on this build, so an older build asks for a key', async () => {
      const scope = '314:new-wallet'
      await saveBrowserSession(scope, { ...base, encryption: current })
      expect(await readRaw(scope)).toEqual({ ...base, encryption2: current })
      expect(await loadBrowserSession(scope)).toEqual({ ...base, encryption: current })
      await saveBrowserSession(scope, null)
    })

    it('recovers after an older tab renews the session and drops the current grant', async () => {
      const scope = '314:old-tab-wallet'
      await saveBrowserSession(scope, { ...base, encryption: current, legacyEncryption: legacy })
      // Older builds rebuild the record field by field, keeping only `encryption`.
      const stored = await readRaw(scope)
      await putRaw(scope, { privateKey: stored.privateKey, expiresAt: 1900000000, encryption: stored.encryption })
      expect(await loadBrowserSession(scope)).toEqual({ ...base, expiresAt: 1900000000, legacyEncryption: legacy })
      await saveBrowserSession(scope, null)
    })

    it('sorts a grant by what it is, even if it sits in the wrong field', async () => {
      const scope = '314:misfiled-wallet'
      await putRaw(scope, { ...base, encryption: current, encryption2: legacy })
      expect(await loadBrowserSession(scope)).toEqual({ ...base, encryption: current, legacyEncryption: legacy })
      await saveBrowserSession(scope, null)
    })
  })

  it('selects one key for concurrent authorizations and notifies readers after durable writes', async () => {
    const scope = '314:concurrent-wallet'
    const first = { privateKey: `0x${'3'.repeat(64)}` as const, expiresAt: 1800000000 }
    const second = { ...first, privateKey: `0x${'4'.repeat(64)}` as const }
    const changed = vi.fn()
    const unsubscribe = subscribeBrowserSession(scope, changed)
    try {
      const selected = await Promise.all([
        updateBrowserSession(scope, (current) => current ?? first),
        updateBrowserSession(scope, (current) => current ?? second),
      ])
      expect(selected).toEqual([first, first])
      expect(await loadBrowserSession(scope)).toEqual(first)
      expect(changed).toHaveBeenCalledOnce()
    } finally {
      unsubscribe()
      await saveBrowserSession(scope, null)
    }
    expect(changed).toHaveBeenCalledOnce()
  })
})

it('reads a legacy encrypted record from the same database and preserves its scope binding', async () => {
  const scope = '314:legacy-wallet'
  const session = { privateKey: `0x${'2'.repeat(64)}`, expiresAt: 1800000000, transactionHash: `0x${'a'.repeat(64)}` }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(scope) },
    key,
    new TextEncoder().encode(JSON.stringify(session))
  )
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('filecoin-drive-session-vault', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('sessions')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite')
    tx.objectStore('sessions').put({ key, iv, ciphertext }, scope)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
  expect(await loadBrowserSession(scope)).toEqual(session)
  expect(await loadBrowserSession('314159:legacy-wallet')).toBeNull()
  await saveBrowserSession(scope, null)
  expect(await loadBrowserSession(scope)).toBeNull()
})

/** The record exactly as it sits in IndexedDB, as any build would read or write it. */
async function openVault() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('filecoin-drive-session-vault', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('sessions')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function putRaw(scope: string, session: Record<string, unknown>) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(scope) },
    key,
    new TextEncoder().encode(JSON.stringify(session))
  )
  const db = await openVault()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite')
    tx.objectStore('sessions').put({ key, iv, ciphertext }, scope)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function readRaw(scope: string): Promise<Record<string, unknown>> {
  const db = await openVault()
  const stored = await new Promise<{ key: CryptoKey; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer }>(
    (resolve, reject) => {
      const request = db.transaction('sessions').objectStore('sessions').get(scope)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }
  )
  db.close()
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: stored.iv, additionalData: new TextEncoder().encode(scope) },
    stored.key,
    stored.ciphertext
  )
  return JSON.parse(new TextDecoder().decode(bytes))
}
