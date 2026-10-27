// @vitest-environment node
import { CarWriter } from '@ipld/car'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { describe, expect, it, vi } from 'vitest'
// Node selects the filesystem export; exercise the same browser builder Vite uses.
import { createCarFromFile } from '../../../node_modules/filecoin-pin/dist/core/unixfs/browser.js'
import { unpackFile } from './download.ts'

describe('original file retrieval', () => {
  it('round-trips a multi-block UnixFS CAR produced by the actual upload library', async () => {
    const bytes = Uint8Array.from({ length: 2 * 1024 * 1024 + 123 }, (_, index) => index % 251)
    const car = await createCarFromFile(new File([bytes], '研究.bin'))
    const downloaded = await unpackFile(car.carBytes, car.rootCid.toString())
    expect(Buffer.compare(Buffer.from(await downloaded.arrayBuffer()), Buffer.from(bytes))).toBe(0)
  })

  it('round-trips an empty file without downloading the CAR envelope', async () => {
    const car = await createCarFromFile(new File([], 'empty.txt'))
    const downloaded = await unpackFile(car.carBytes, car.rootCid.toString())
    expect(downloaded.size).toBe(0)
  })

  it('extracts file bytes rather than saving the CAR wrapper', async () => {
    const bytes = new TextEncoder().encode('hello Filecoin')
    const root = CID.createV1(0x55, await sha256.digest(bytes))
    const { writer, out } = CarWriter.create([root])
    const chunks: Uint8Array[] = []
    const drain = (async () => {
      for await (const chunk of out) chunks.push(chunk)
    })()
    await writer.put({ cid: root, bytes })
    await writer.close()
    await drain
    const car = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
    let offset = 0
    for (const chunk of chunks) {
      car.set(chunk, offset)
      offset += chunk.length
    }
    const file = await unpackFile(car, root.toString())
    const buffer = await file.arrayBuffer()
    expect(new Uint8Array(buffer)).toEqual(bytes)
    const otherRoot = CID.createV1(0x55, await sha256.digest(new Uint8Array([9])))
    await expect(unpackFile(car, otherRoot.toString())).rejects.toThrow('expected root CID')
  })
})

it('downloads an imported archive as the original CAR bytes rather than its inner file', async () => {
  const { downloadFile } = await import('./download.ts')
  const car = await createCarFromFile(new File(['inside the archive'], 'inside.txt'))
  const blobs: Blob[] = []
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
  vi.stubGlobal('document', { createElement: () => anchor, body: { append: vi.fn() } })
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    if (blob instanceof Blob) blobs.push(blob)
    return 'blob:archive'
  })
  vi.useFakeTimers()
  try {
    const synapse = { storage: { createContext: async () => ({ download: async () => car.carBytes }) } }
    await downloadFile(
      synapse as unknown as import('@filoz/synapse-sdk').Synapse,
      {
        cid: car.rootCid.toString(),
        pieceCid: 'piece',
        datasetId: '1',
        fileName: 'original.car',
        importedCar: true,
      } as import('../../hooks/use-dataset-pieces.ts').DatasetPiece
    )
    expect(anchor.download).toBe('original.car')
    expect(blobs).toHaveLength(1)
    expect(new Uint8Array(await blobs[0].arrayBuffer())).toEqual(car.carBytes)
    expect(blobs[0].type).toBe('application/vnd.ipld.car')
  } finally {
    vi.clearAllTimers()
    vi.useRealTimers()
    createUrl.mockRestore()
    vi.unstubAllGlobals()
  }
})
