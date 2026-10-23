import type { Hex } from 'viem'

export interface BrowserSession {
  privateKey: Hex
  expiresAt: number
  transactionHash?: Hex
}

// The wrapping key is non-exportable. Directory backups never include this database.
const openVault = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('filecoin-drive-session-vault', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('sessions')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Unable to open browser session storage'))
  })

async function read(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = db.transaction('sessions').objectStore('sessions').get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function write(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite')
    if (value === null) tx.objectStore('sessions').delete(key)
    else tx.objectStore('sessions').put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(new Error('Session storage write was aborted'))
  })
}

export async function saveBrowserSession(scope: string, session: BrowserSession | null) {
  const db = await openVault()
  try {
    if (!session) return await write(db, scope, null)
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(scope) },
      key,
      new TextEncoder().encode(JSON.stringify(session))
    )
    await write(db, scope, { key, iv, ciphertext })
  } finally {
    db.close()
  }
}

export async function loadBrowserSession(scope: string): Promise<BrowserSession | null> {
  const db = await openVault()
  try {
    const stored = (await read(db, scope)) as
      | { key: CryptoKey; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer }
      | undefined
    if (!stored) return null
    const bytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: stored.iv, additionalData: new TextEncoder().encode(scope) },
      stored.key,
      stored.ciphertext
    )
    const session = JSON.parse(new TextDecoder().decode(bytes)) as BrowserSession
    if (!/^0x[0-9a-f]{64}$/i.test(session.privateKey) || !Number.isFinite(session.expiresAt)) return null
    return session
  } finally {
    db.close()
  }
}
