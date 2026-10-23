import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Node 22+ defines an experimental `localStorage` global that is undefined
 * unless Node is started with `--localstorage-file`, and it shadows jsdom's
 * implementation. Replace both web storage globals with an in-memory shim so
 * code under test sees a working Storage API.
 */
const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => {
      store.clear()
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, name, {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  })
}

// jsdom has no Web Locks. Serialize same-name requests here; browser tests use native locks across real tabs.
const lockTails = new Map<string, Array<{ mode: LockMode; done: Promise<unknown> }>>()
Object.defineProperty(navigator, 'locks', {
  configurable: true,
  value: {
    request: (name: string, optionsOrOperation: LockOptions | LockGrantedCallback, callback?: LockGrantedCallback) => {
      const operation = typeof optionsOrOperation === 'function' ? optionsOrOperation : callback
      if (!operation) throw new TypeError('A lock callback is required')
      const options = typeof optionsOrOperation === 'function' ? {} : optionsOrOperation
      const mode = options.mode ?? 'exclusive'
      const holders = lockTails.get(name) ?? []
      const compatible = mode === 'shared' && holders.every((holder) => holder.mode === 'shared')
      if (options.ifAvailable && holders.length && !compatible) return Promise.resolve().then(() => operation(null))
      const run = () => operation({ name, mode } as Lock)
      const result = (compatible ? Promise.resolve() : Promise.all(holders.map((holder) => holder.done))).then(run)
      const holder = { mode, done: result.catch(() => undefined) }
      lockTails.set(name, [...holders, holder])
      void holder.done.then(() => {
        const remaining = (lockTails.get(name) ?? []).filter((entry) => entry !== holder)
        if (remaining.length) lockTails.set(name, remaining)
        else lockTails.delete(name)
      })
      return result
    },
  },
})

// Cleanup after each test
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})
