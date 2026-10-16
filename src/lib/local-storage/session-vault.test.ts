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
