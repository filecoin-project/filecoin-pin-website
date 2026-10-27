import { webcrypto } from 'node:crypto'
import { indexedDB } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadBrowserSession, saveBrowserSession } from './session-vault.ts'

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
