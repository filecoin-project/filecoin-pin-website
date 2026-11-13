// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CarReader } from '@ipld/car'
import { createCarFromFile } from 'filecoin-pin/core/unixfs'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Node selects the filesystem export; exercise the same browser builder Vite uses.
vi.mock('filecoin-pin/core/unixfs', () => import('../../../node_modules/filecoin-pin/dist/core/unixfs/browser.js'))

// The reference implementation this payload must satisfy: filecoin-pin's own
// streaming unpacker, which enforces the metadata-first wrapper-directory
// profile that `add --encrypt` writes and `get`/the share viewer read.
import { unpackCar } from '../../../node_modules/filecoin-pin/dist/common/unixfs-car-unpack.js'
import { buildEncryptedPayload, payloadEntry } from './encrypted-payload.ts'

async function unpackWithReferenceCli(carBytes: Uint8Array) {
  const dir = await mkdtemp(join(tmpdir(), 'drive-payload-'))
  cleanups.push(dir)
  const result = await unpackCar(
    (async function* () {
      yield carBytes
    })() as never,
    dir
  )
  return { dir, result }
}

const cleanups: string[] = []
afterEach(async () => {
  for (const dir of cleanups.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('buildEncryptedPayload (filecoin-pin wire layout)', () => {
  it('packs a single file so the filecoin-pin CLI unpacks it byte-exact under its name', async () => {
    const bytes = Uint8Array.from({ length: 300_000 + 7 }, (_, i) => i % 251)
    const payload = await buildEncryptedPayload({ kind: 'file', file: new File([bytes as BlobPart], '研究 notes.bin') })
    const { dir, result } = await unpackWithReferenceCli(payload.carBytes)
    expect(result.files).toBe(1)
    expect(await readdir(dir)).toEqual(['研究 notes.bin'])
    expect(new Uint8Array(await readFile(join(dir, '研究 notes.bin')))).toEqual(bytes)
  })

  it('packs a folder so the CLI restores its tree under the folder name', async () => {
    const a = new File(['alpha'], 'a.txt')
    Object.defineProperty(a, 'webkitRelativePath', { value: 'docs/a.txt' })
    const b = new File(['beta'], 'b.txt')
    Object.defineProperty(b, 'webkitRelativePath', { value: 'docs/sub/b.txt' })
    const payload = await buildEncryptedPayload({ kind: 'directory', files: [a, b], name: 'docs' })
    const { dir, result } = await unpackWithReferenceCli(payload.carBytes)
    expect(result.files).toBe(2)
    expect(await readFile(join(dir, 'docs', 'a.txt'), 'utf8')).toBe('alpha')
    expect(await readFile(join(dir, 'docs', 'sub', 'b.txt'), 'utf8')).toBe('beta')
  })

  it.each([4096, 2 * 1024 * 1024 + 17])(
    'round-trips an imported CAR through the CLI unpacker (%i source bytes)',
    async (size) => {
      const bytes = Uint8Array.from({ length: size }, (_, i) => i % 251)
      const { carBytes } = await createCarFromFile(new File([bytes as BlobPart], 'source.bin'))
      const payload = await buildEncryptedPayload({ kind: 'car', carBytes, name: 'archive.car' })
      const { dir, result } = await unpackWithReferenceCli(payload.carBytes)
      const restored = await readFile(join(dir, 'archive.car'))
      expect(result.files).toBe(1)
      expect(restored.byteLength).toBe(carBytes.byteLength)
      expect(Buffer.compare(restored, Buffer.from(carBytes))).toBe(0)
    }
  )

  it('names the wrapper entry so Drive can descend without guessing', async () => {
    const payload = await buildEncryptedPayload({ kind: 'file', file: new File(['x'], 'tiny.txt') })
    const reader = await CarReader.fromBytes(payload.carBytes)
    const entry = await payloadEntry(reader)
    expect(entry?.name).toBe('tiny.txt')
    expect(payload.rootCid).toBe((await reader.getRoots())[0].toString())
    expect(entry?.cid.toString()).not.toBe(payload.rootCid)
  })

  it('refuses entry names that cannot be restored from the wire', async () => {
    await expect(buildEncryptedPayload({ kind: 'file', file: new File(['x'], '../escape') })).rejects.toThrow(
      /unsafe|name/i
    )
  })
})
