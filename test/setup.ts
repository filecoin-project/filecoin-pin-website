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

// Cleanup after each test
afterEach(() => {
  cleanup()
})
