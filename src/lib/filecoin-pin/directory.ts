import type { exporter } from 'ipfs-unixfs-exporter'
import { MAX_FILE_SIZE } from '../../constants/files.ts'
import { safeDirectoryName } from './ipfs-content.ts'

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
