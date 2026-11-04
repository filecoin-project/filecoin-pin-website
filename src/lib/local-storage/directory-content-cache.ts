import { createStore, get, update } from 'idb-keyval'
import type { DirectoryItem } from '../filecoin-pin/directory.ts'

export type DirectoryPage = { items: DirectoryItem[]; hasMore: boolean; cid: string }
type CachedPage = { key: string; page: DirectoryPage; bytes: number }
const pages = createStore('filecoin-drive-directory-cache', 'pages')
const CACHE_KEY = 'v1'
const MAX_BYTES = 4 * 1024 * 1024
const MAX_ENTRIES = 10_000
const MAX_PAGES = 256
const pageKey = (root: string, path: string, offset: number) => JSON.stringify([root, path, offset])

/** CID-addressed metadata is immutable. Storage failure is a cache miss, never data loss. */
export async function loadDirectoryPage(root: string, path: string, offset: number) {
  try {
    const cached = await get<CachedPage[]>(CACHE_KEY, pages)
    return cached?.find((entry) => entry.key === pageKey(root, path, offset))?.page
  } catch {
    return undefined
  }
}

/** One atomic update merges concurrent tabs and evicts oldest pages within fixed budgets. */
export async function saveDirectoryPages(
  root: string,
  values: { path: string; offset: number; page: DirectoryPage }[]
) {
  try {
    const incoming = values.map(({ path, offset, page }) => ({
      key: pageKey(root, path, offset),
      page,
      bytes: JSON.stringify(page).length * 2,
    }))
    await update<CachedPage[]>(
      CACHE_KEY,
      (current = []) => {
        const merged = new Map(current.map((entry) => [entry.key, entry]))
        for (const entry of incoming) {
          if (entry.bytes > MAX_BYTES) continue
          // Do not replace an already cached page of this immutable DAG.
          if (!merged.has(entry.key)) merged.set(entry.key, entry)
        }
        const result = [...merged.values()]
        let bytes = result.reduce((sum, entry) => sum + entry.bytes, 0)
        let items = result.reduce((sum, entry) => sum + entry.page.items.length, 0)
        while (result.length > MAX_PAGES || bytes > MAX_BYTES || items > MAX_ENTRIES) {
          const oldest = result.shift()
          if (!oldest) break
          bytes -= oldest.bytes
          items -= oldest.page.items.length
        }
        return result
      },
      pages
    )
  } catch {
    // IndexedDB may be unavailable or full. Never block uploads or discard a fetched listing.
  }
}
