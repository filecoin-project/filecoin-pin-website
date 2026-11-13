// @vitest-environment node
import { CarReader } from '@ipld/car'
import { unzipSync } from 'fflate'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock(
  'filecoin-pin/core/unixfs',
  async () => import('../../../node_modules/filecoin-pin/dist/core/unixfs/browser.js')
)

import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { downloadFile, unpackFile } from './download.ts'
import { fileShareLink } from './file-links.ts'
import { recoverContentInfo } from './file-size.ts'
import { contentReader } from './ipfs-content.ts'
import { prepareUploadInput } from './upload-input.ts'
import { directoryUpload } from './upload-source.ts'

function selectedFile(path: string, contents: string) {
  const file = new File([contents], path.split('/').at(-1) ?? '')
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}
async function fixture() {
  const source = directoryUpload([
    selectedFile('reports/研究.txt', 'hello folder'),
    selectedFile('reports/docs/notes.txt', 'nested notes'),
  ])
  const packed = await prepareUploadInput(source)
  const car = await CarReader.fromBytes(packed.carBytes)
  const file: DatasetPiece = {
    id: 'directory',
    fileName: source.name,
    isDirectory: true,
    fileSize: '24 Bytes',
    cid: packed.rootCid.toString(),
    pieceCid: 'piece',
    providerId: '4',
    providerName: 'SP',
    datasetId: '14',
    datasetIds: ['14'],
    serviceURL: 'https://sp.example',
    transactionHash: '',
    network: 'calibration',
    uploadedAt: 1000,
    copyCount: 1,
  }
  const fetcher = vi.fn(async (url: URL) => {
    const cid = new URL(String(url)).pathname.split('/')[2]
    const block = await car.get((await import('multiformats/cid')).CID.parse(cid))
    return block
      ? new Response(new Uint8Array(block.bytes), { headers: { 'content-type': 'application/vnd.ipld.raw' } })
      : new Response('', { status: 404 })
  })
  vi.stubGlobal('fetch', fetcher)
  return { source, packed, file, fetcher }
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('packs one directory root and verifies public root metadata without browsing children', async () => {
  const { source, packed, file, fetcher } = await fixture()
  expect(source.name).toBe('reports')
  expect(packed.isDirectory).toBe(true)
  expect(await recoverContentInfo({ ...file, isDirectory: undefined }, new AbortController().signal)).toEqual({
    isDirectory: true,
    fileSize: '—',
  })
  expect(fetcher.mock.calls).toHaveLength(1)
})
it('downloads a directory as a ZIP and extracts a nested file from the original CAR', async () => {
  const { packed } = await fixture()
  const zip = await unpackFile(packed.carBytes, packed.rootCid.toString(), '', 'reports')
  expect(zip.type).toBe('application/zip')
  const files = unzipSync(new Uint8Array(await zip.arrayBuffer()))
  expect(new TextDecoder().decode(files['reports/研究.txt'])).toBe('hello folder')
  expect(new TextDecoder().decode(files['reports/docs/notes.txt'])).toBe('nested notes')
  expect(await (await unpackFile(packed.carBytes, packed.rootCid.toString(), 'docs/notes.txt')).text()).toBe(
    'nested notes'
  )
})
it('downloads only a selected child through verified IPFS reads and shares directory roots as browse links', async () => {
  const { file, fetcher } = await fixture()
  const reader = contentReader(file, new AbortController().signal)
  const entry = await reader.entry('docs/notes.txt')
  const item = { name: 'notes.txt', path: 'docs/notes.txt', cid: entry.cid.toString() }
  const child = {
    ...file,
    id: 'child',
    fileName: item.name,
    cid: item.cid,
    isDirectory: false,
    directoryEntry: { rootCid: file.cid, path: item.path },
  }
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
  vi.stubGlobal('document', { createElement: () => anchor, body: { append: vi.fn() } })
  const blobs: Blob[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob as Blob)
    return 'blob:child'
  })
  vi.useFakeTimers()
  const createContext = vi.fn()
  await downloadFile({ storage: { createContext } } as unknown as import('@filoz/synapse-sdk').Synapse, child)
  expect(createContext).not.toHaveBeenCalled()
  expect(anchor.download).toBe('notes.txt')
  expect(await blobs[0].text()).toBe('nested notes')
  expect(fileShareLink(file)).toBe(`https://${file.cid}.ipfs.inbrowser.link/`)
  expect(fileShareLink(child)).toBe(`https://${item.cid}.ipfs.inbrowser.link/?filename=notes.txt`)
  expect(fetcher.mock.calls.every(([url]) => !String(url).includes('/piece/'))).toBe(true)
})
it('rejects unrelated or unsafe folder paths and enforces a total upload-size limit', () => {
  expect(() => directoryUpload([])).toThrow('at least one file')
  expect(() => directoryUpload([selectedFile('one/a.txt', 'x'), selectedFile('two/b.txt', 'x')])).toThrow('one folder')
  expect(() => directoryUpload([selectedFile('one/../a.txt', 'x')])).toThrow()
  const large = selectedFile('one/large.bin', 'x')
  Object.defineProperty(large, 'size', { value: 200_000_001 })
  expect(() => directoryUpload([large])).toThrow('200 MB')
})
