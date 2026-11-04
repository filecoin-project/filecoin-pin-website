// @vitest-environment node
import { CarWriter } from '@ipld/car'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { expect, it, vi } from 'vitest'

// Exercise the browser implementation that Vite selects in the actual app.
vi.mock(
  'filecoin-pin/core/unixfs',
  async () => import('../../../node_modules/filecoin-pin/dist/core/unixfs/browser.js')
)

import { prepareUploadInput } from './upload-input.ts'

async function archive(roots: CID[], blocks: { cid: CID; bytes: Uint8Array }[]) {
  const { writer, out } = CarWriter.create(roots)
  const chunks: Uint8Array[] = []
  const drain = (async () => {
    for await (const chunk of out) chunks.push(chunk)
  })()
  for (const block of blocks) await writer.put(block)
  await writer.close()
  await drain
  return new Uint8Array(Buffer.concat(chunks))
}
const block = async (text: string) => {
  const bytes = new TextEncoder().encode(text)
  return { cid: CID.createV1(0x55, await sha256.digest(bytes)), bytes }
}

it('detects a CAR by content, preserves every byte and uses its first root', async () => {
  const a = await block('first')
  const b = await block('second')
  const bytes = await archive([a.cid, b.cid], [a, b])
  const result = await prepareUploadInput(new File([bytes], 'archive.bin'))
  expect(result.importedCar).toBe(true)
  expect(result.rootCid.equals(a.cid)).toBe(true)
  expect(result.carBytes).toEqual(bytes)
})

it('keeps the browser UnixFS path for normal files, including non-ASCII names', async () => {
  const result = await prepareUploadInput(new File(['hello'], '研究.txt'))
  expect(result.importedCar).toBe(false)
  const { unpackFile } = await import('./download.ts')
  expect(await (await unpackFile(result.carBytes, result.rootCid.toString())).text()).toBe('hello')
})

it('rejects recognized rootless or incomplete CAR inputs before upload', async () => {
  const a = await block('missing')
  await expect(prepareUploadInput(new File([await archive([], [a])], 'rootless.car'))).rejects.toThrow(
    'at least one root'
  )
  await expect(prepareUploadInput(new File([await archive([a.cid], [])], 'incomplete.car'))).rejects.toThrow(
    'missing its root block'
  )
})

it('uses file content rather than an extension to choose import mode', async () => {
  const result = await prepareUploadInput(new File(['ordinary content'], 'notes.car'))
  expect(result.importedCar).toBe(false)
  const { unpackFile } = await import('./download.ts')
  expect(await (await unpackFile(result.carBytes, result.rootCid.toString())).text()).toBe('ordinary content')
})
