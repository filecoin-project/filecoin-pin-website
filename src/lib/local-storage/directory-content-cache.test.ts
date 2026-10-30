import { indexedDB } from 'fake-indexeddb'
import * as idb from 'idb-keyval'
import { clear, createStore } from 'idb-keyval'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { type DirectoryPage, loadDirectoryPage, saveDirectoryPages } from './directory-content-cache.ts'

vi.mock('idb-keyval', { spy: true })

const store = createStore('filecoin-drive-directory-cache', 'pages')
const page: DirectoryPage = {
  items: [{ name: 'README.md', path: 'docs/README.md', cid: 'child', isDirectory: false, size: 123 }],
  hasMore: false,
  cid: 'directory',
}
beforeEach(async () => {
  vi.stubGlobal('indexedDB', indexedDB)
  await clear(store)
})
afterEach(() => vi.unstubAllGlobals())

it('persists listings across module reloads and isolates root, path and page', async () => {
  await saveDirectoryPages('root', [{ path: 'docs', offset: 0, page }])
  vi.resetModules()
  const reloaded = await import('./directory-content-cache.ts')
  expect(await reloaded.loadDirectoryPage('root', 'docs', 0)).toEqual(page)
  expect(await reloaded.loadDirectoryPage('other-root', 'docs', 0)).toBeUndefined()
  expect(await reloaded.loadDirectoryPage('root', '', 0)).toBeUndefined()
  expect(await reloaded.loadDirectoryPage('root', 'docs', 100)).toBeUndefined()
})

it('merges concurrent writes without replacing immutable pages', async () => {
  await Promise.all([
    saveDirectoryPages('root', [{ path: 'docs', offset: 0, page }]),
    saveDirectoryPages('other', [{ path: '', offset: 0, page: { ...page, items: [] } }]),
  ])
  await saveDirectoryPages('root', [{ path: 'docs', offset: 0, page: { ...page, items: [] } }])
  expect(await loadDirectoryPage('root', 'docs', 0)).toEqual(page)
  expect(await loadDirectoryPage('other', '', 0)).toEqual({ ...page, items: [] })
})

it('evicts oldest pages at the page budget and preserves recently inserted pages', async () => {
  await saveDirectoryPages(
    'root',
    Array.from({ length: 257 }, (_, offset) => ({
      path: '',
      offset,
      page: { ...page, items: [] },
    }))
  )
  expect(await loadDirectoryPage('root', '', 0)).toBeUndefined()
  expect(await loadDirectoryPage('root', '', 256)).toEqual({ ...page, items: [] })
})

it('treats IndexedDB failure as optional and retains previously saved data', async () => {
  await saveDirectoryPages('root', [{ path: 'docs', offset: 0, page }])
  vi.mocked(idb.update).mockRejectedValueOnce(new Error('Quota exceeded'))
  await expect(saveDirectoryPages('other', [{ path: '', offset: 0, page }])).resolves.toBeUndefined()
  expect(await loadDirectoryPage('root', 'docs', 0)).toEqual(page)
  vi.mocked(idb.get).mockRejectedValueOnce(new Error('Unavailable'))
  expect(await loadDirectoryPage('root', 'docs', 0)).toBeUndefined()
})
