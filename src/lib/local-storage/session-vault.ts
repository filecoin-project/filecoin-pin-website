import { createStore, del, get, set } from 'idb-keyval'
import type { Hex } from 'viem'

export interface BrowserSession {
  privateKey: Hex
  expiresAt: number
  transactionHash?: Hex
  revision?: string
}

// Keep the existing database, store and record format so authorized sessions survive upgrades.
const sessions = createStore('filecoin-drive-session-vault', 'sessions')
const CHANGE_EVENT = 'filecoin-drive-session-change'
const source = crypto.randomUUID?.() ?? String(Math.random())

async function writeBrowserSession(scope: string, session: BrowserSession | null) {
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

/** Serialize key selection and writes, without holding a lock during wallet prompts or RPCs. */
export async function updateBrowserSession(
  scope: string,
  update: (current: BrowserSession | null) => BrowserSession | null
): Promise<BrowserSession | null> {
  if (!navigator.locks?.request) throw new Error('Session storage requires a current browser over HTTPS.')
  return navigator.locks.request(`filecoin-drive-session-${scope}`, async () => {
    const current = await loadBrowserSession(scope)
    const next = update(current)
    if (next !== current) {
      await writeBrowserSession(scope, next)
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: scope }))
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(CHANGE_EVENT)
        channel.postMessage({ scope, source })
        channel.close()
      }
    }
    return next
  })
}

export const saveBrowserSession = (scope: string, session: BrowserSession | null) =>
  updateBrowserSession(scope, () => session)

/** Messages contain a scope and page ID; credentials are always reread from the vault. */
export function subscribeBrowserSession(scope: string, changed: () => void): () => void {
  const local = (event: Event) => {
    if ((event as CustomEvent<string>).detail === scope) changed()
  }
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANGE_EVENT)
  if (channel)
    channel.onmessage = (event) => {
      if (event.data?.scope === scope && event.data.source !== source) changed()
    }
  const visible = () => {
    if (document.visibilityState === 'visible') changed()
  }
  window.addEventListener(CHANGE_EVENT, local)
  window.addEventListener('focus', changed)
  window.addEventListener('pageshow', changed)
  document.addEventListener('visibilitychange', visible)
  document.addEventListener('resume', changed)
  return () => {
    channel?.close()
    window.removeEventListener(CHANGE_EVENT, local)
    window.removeEventListener('focus', changed)
    window.removeEventListener('pageshow', changed)
    document.removeEventListener('visibilitychange', visible)
    document.removeEventListener('resume', changed)
  }
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
