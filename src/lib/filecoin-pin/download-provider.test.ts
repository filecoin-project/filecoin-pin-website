import { Blob as NodeBlob } from 'node:buffer'
import type { Synapse } from '@filoz/synapse-sdk'
import { CarWriter } from '@ipld/car'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { downloadFile } from './download.ts'

const createObjectURL = vi.fn()
let click: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
  createObjectURL.mockReset().mockReturnValue('blob:test')
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.runAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function carFor(bytes: Uint8Array) {
  const root = CID.createV1(0x55, await sha256.digest(bytes))
  const { writer, out } = CarWriter.create([root])
  const chunks: Uint8Array[] = []
  const drain = (async () => {
    for await (const chunk of out) chunks.push(chunk)
  })()
  await writer.put({ cid: root, bytes })
  await writer.close()
  await drain
  return { root: root.toString(), bytes: Uint8Array.from(Buffer.concat(chunks)) }
}

it('retrieves an imported record from a second copy and saves original bytes with its display name', async () => {
  const bytes = Uint8Array.from(new TextEncoder().encode('original file bytes'))
  const car = await carFor(bytes)
  const first = vi.fn().mockRejectedValue(new Error('provider offline'))
  const second = vi.fn().mockResolvedValue(car.bytes)
  const createContext = vi
    .fn()
    .mockImplementation(async ({ dataSetId }) => ({ download: dataSetId === 1n ? first : second }))
  const file = {
    cid: car.root,
    pieceCid: 'piece',
    fileName: '研究.txt',
    datasetId: '1',
    datasetIds: ['1', '2'],
  } as DatasetPiece
  await downloadFile({ storage: { createContext } } as unknown as Synapse, file)
  expect(createContext.mock.calls.map(([options]) => options.dataSetId)).toEqual([1n, 2n])
  expect(second).toHaveBeenCalledWith({ pieceCid: 'piece', withCDN: false })
  const saved = createObjectURL.mock.calls[0][0] as Blob
  expect(new Uint8Array(await saved.arrayBuffer())).toEqual(bytes)
  expect(click.mock.instances[0].download).toBe('研究.txt')
  expect(document.querySelector('a')).toBeNull()
})

it('never saves an unrelated CAR returned by a provider', async () => {
  const expected = await carFor(new Uint8Array([1]))
  const unrelated = await carFor(new Uint8Array([2]))
  const file = { cid: expected.root, pieceCid: 'piece', datasetId: '1' } as DatasetPiece
  const synapse = {
    storage: { createContext: async () => ({ download: async () => unrelated.bytes }) },
  } as unknown as Synapse
  await expect(downloadFile(synapse, file)).rejects.toThrow('Unable to download')
  expect(createObjectURL).not.toHaveBeenCalled()
})
