import { createStore, del, get, set } from 'idb-keyval'
import type { Hex } from 'viem'

export interface BrowserSession {
  privateKey: Hex
  expiresAt: number
  transactionHash?: Hex
}

// Keep the existing database, store and record format so authorized sessions survive upgrades.
const sessions = createStore('filecoin-drive-session-vault', 'sessions')

export async function saveBrowserSession(scope: string, session: BrowserSession | null) {
  if (!session) return del(scope, sessions)
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(scope) },
    key,
    new TextEncoder().encode(JSON.stringify(session))
  )
  await set(scope, { key, iv, ciphertext }, sessions)
}

export async function loadBrowserSession(scope: string): Promise<BrowserSession | null> {
  const stored = await get<{ key: CryptoKey; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer }>(scope, sessions)
  if (!stored) return null
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: stored.iv, additionalData: new TextEncoder().encode(scope) },
    stored.key,
    stored.ciphertext
  )
  const session = JSON.parse(new TextDecoder().decode(bytes)) as BrowserSession
  if (!/^0x[0-9a-f]{64}$/i.test(session.privateKey) || !Number.isFinite(session.expiresAt)) return null
  return session
}
