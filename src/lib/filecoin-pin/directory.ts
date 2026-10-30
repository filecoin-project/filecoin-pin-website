import { CarReader } from '@ipld/car'
import { exporter } from 'ipfs-unixfs-exporter'
import { MAX_FILE_SIZE } from '../../constants/files.ts'
import { loadDirectoryPage, saveDirectoryPages } from '../local-storage/directory-content-cache.ts'
import type { ContentReader } from './ipfs-content.ts'
import { safeDirectoryName } from './ipfs-content.ts'

export type DirectoryItem = { name: string; path: string; cid: string; isDirectory: boolean; size?: number }
export const DIRECTORY_PAGE_SIZE = 100

// Per-tab metadata only: never retain the CAR or file bytes after packing.
const localDirectories = new Map<string, Map<string, { items: DirectoryItem[]; cid: string }>>()
const MAX_CACHED_ENTRIES = 10_000
let cachedEntries = 0

export async function cacheDirectoryUpload(bytes: Uint8Array, rootCid: string) {
  if (localDirectories.has(rootCid)) return
  const car = await CarReader.fromBytes(bytes)
  const blockstore = {
    get: async function* (cid: Parameters<typeof car.get>[0]) {
      const block = await car.get(cid)
      if (!block) throw new Error('Missing directory block.')
      yield block.bytes
    },
  }
  const directories = new Map<string, { items: DirectoryItem[]; cid: string }>()
  let count = 0
  let metadataBytes = 0
  const pending = ['']
  while (pending.length) {
    const path = pending.pop() as string
    const directory = await exporter(`${rootCid}${path ? `/${path}` : ''}`, blockstore)
    if (directory.type !== 'directory') throw new Error('This IPFS entry is not a folder.')
    const items: DirectoryItem[] = []
    for await (const link of directory.entries()) {
      const name = safeDirectoryName(link.name)
      const childPath = [path, name].filter(Boolean).join('/')
      count++
      metadataBytes += childPath.length * 2 + 256
      if (count > MAX_CACHED_ENTRIES || metadataBytes > 4 * 1024 * 1024) return
      const entry = await exporter(link.path, blockstore)
      items.push({
        name,
        path: childPath,
        cid: link.cid.toString(),
        isDirectory: entry.type === 'directory',
        size:
          entry.type === 'file' || entry.type === 'raw' || entry.type === 'identity' ? Number(entry.size) : undefined,
      })
      if (entry.type === 'directory') pending.push(childPath)
    }
    directories.set(path, { items, cid: directory.cid.toString() })
  }
  while (localDirectories.size && (cachedEntries + count > MAX_CACHED_ENTRIES || localDirectories.size >= 8)) {
    const oldest = localDirectories.keys().next().value
    if (!oldest) break
    for (const directory of localDirectories.get(oldest)?.values() ?? []) cachedEntries -= directory.items.length
    localDirectories.delete(oldest)
  }
  localDirectories.set(rootCid, directories)
  cachedEntries += count
  await saveDirectoryPages(
    rootCid,
    [...directories].flatMap(([path, directory]) => {
      const pages = []
      for (let offset = 0; offset === 0 || offset < directory.items.length; offset += DIRECTORY_PAGE_SIZE) {
        pages.push({
          path,
          offset,
          page: {
            items: directory.items.slice(offset, offset + DIRECTORY_PAGE_SIZE),
            hasMore: offset + DIRECTORY_PAGE_SIZE < directory.items.length,
            cid: directory.cid,
          },
        })
      }
      return pages
    })
  )
}

export async function listDirectory(reader: ContentReader, path: string, offset: number, signal: AbortSignal) {
  signal.throwIfAborted()
  const cached = localDirectories.get(reader.rootCid)?.get(path)
  if (cached)
    return {
      items: cached.items.slice(offset, offset + DIRECTORY_PAGE_SIZE),
      hasMore: offset + DIRECTORY_PAGE_SIZE < cached.items.length,
      cid: cached.cid,
    }
  const persisted = await loadDirectoryPage(reader.rootCid, path, offset)
  signal.throwIfAborted()
  if (persisted) return persisted
  const directory = await reader.entry(path)
  if (directory.type !== 'directory') throw new Error('This IPFS entry is not a folder.')
  const links: { name: string; path: string; cid: string }[] = []
  let index = 0
  let hasMore = false
  for await (const link of directory.entries()) {
    signal.throwIfAborted()
    if (index++ < offset) continue
    if (links.length === DIRECTORY_PAGE_SIZE) {
      hasMore = true
      break
    }
    const name = safeDirectoryName(link.name)
    links.push({ name, path: [path, name].filter(Boolean).join('/'), cid: link.cid.toString() })
  }
  const items: DirectoryItem[] = new Array(links.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(4, links.length) }, async () => {
      while (next < links.length) {
        signal.throwIfAborted()
        const i = next++
        const link = links[i]
        const entry = await reader.entry(link.path)
        items[i] = {
          ...link,
          isDirectory: entry.type === 'directory',
          size:
            entry.type === 'file' || entry.type === 'raw' || entry.type === 'identity' ? Number(entry.size) : undefined,
        }
      }
    })
  )
  signal.throwIfAborted()
  const page = { items, hasMore, cid: directory.cid.toString() }
  await saveDirectoryPages(reader.rootCid, [{ path, offset, page }])
  signal.throwIfAborted()
  return page
}

/** Stream file chunks into an uncompressed ZIP; preserve names and empty subdirectories. */
export async function zipDirectory(
  root: Awaited<ReturnType<typeof exporter>>,
  resolve: (path: string) => ReturnType<typeof exporter>,
  name: string
) {
  const { Zip, ZipPassThrough } = await import('fflate')
  const chunks: ArrayBuffer[] = []
  const archive = new Zip((error, bytes) => {
    if (error) throw error
    chunks.push(new Uint8Array(bytes).buffer)
  })
  let total = 0
  let count = 0
  const add = async (entry: typeof root, path: string) => {
    if (++count > 10_000) throw new Error('This folder has too many entries for a browser ZIP download.')
    if (entry.type === 'directory') {
      const folder = new ZipPassThrough(`${path}/`)
      archive.add(folder)
      folder.push(new Uint8Array(), true)
      for await (const link of entry.entries()) {
        const child = await resolve(link.path)
        await add(child, `${path}/${safeDirectoryName(link.name)}`)
      }
    } else if (entry.type === 'file' || entry.type === 'raw' || entry.type === 'identity') {
      const file = new ZipPassThrough(path)
      archive.add(file)
      for await (const chunk of entry.content()) {
        total += chunk.length
        if (total > MAX_FILE_SIZE) throw new Error('This folder exceeds the 200 MB browser download limit.')
        file.push(chunk, false)
      }
      file.push(new Uint8Array(), true)
    } else throw new Error('Unsupported directory entry.')
  }
  await add(root, safeDirectoryName(name))
  archive.end()
  return new Blob(chunks, { type: 'application/zip' })
}
