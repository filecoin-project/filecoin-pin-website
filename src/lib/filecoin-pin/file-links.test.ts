import { expect, it } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { canPreviewFile, fileGatewayLink, fileShareLink } from './file-links.ts'

const cid = 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe'
const file = {
  fileName: '研究 & notes.txt',
  cid,
  pieceCid: 'bafk-piece',
  datasetId: '1',
  serviceURL: 'https://sp.example',
} as DatasetPiece

it('shares previewable files on an isolated inbrowser origin without the IPLD inspector flag', () => {
  const url = new URL(fileShareLink(file) as string)
  expect(url.hostname).toBe(`${cid}.ipfs.inbrowser.link`)
  expect(url.searchParams.get('filename')).toBe(file.fileName)
  expect(url.searchParams.has('download')).toBe(false)
})

it('shares unsupported formats as downloads and always offers an ordinary-file gateway download', () => {
  const archive = { ...file, fileName: 'installer.dmg' }
  expect(canPreviewFile(archive)).toBe(false)
  expect(fileShareLink(archive)).toBe(fileGatewayLink(archive))
  for (const item of [file, archive]) {
    const url = new URL(fileGatewayLink(item) as string)
    expect(url.hostname).toBe('inbrowser.link')
    expect(url.searchParams.get('download')).toBe('true')
    expect(url.searchParams.get('filename')).toBe(item.fileName)
  }
})

it('shares the exact CAR piece rather than reconstructing its first IPFS root', () => {
  const car = { ...file, importedCar: true, serviceURLs: ['', 'bad url', 'https://sp.example/piece/old'] }
  expect(canPreviewFile(car)).toBe(false)
  expect(fileShareLink(car)).toBe('https://sp.example/piece/bafk-piece')
  expect(fileGatewayLink(car)).toBeUndefined()
})

it('does not invent links for missing roots or provider URLs, and keeps removed files unshareable', () => {
  expect(fileShareLink({ ...file, cid: '' })).toBeUndefined()
  expect(fileGatewayLink({ ...file, cid: '' })).toBeUndefined()
  expect(fileShareLink({ ...file, importedCar: true, serviceURL: 'javascript:alert(1)' })).toBeUndefined()
  expect(fileShareLink({ ...file, importedCar: true, cid: '' })).toBe('https://sp.example/piece/bafk-piece')
  expect(fileShareLink({ ...file, removedCopies: ['1'] })).toBeUndefined()
})

it('shares a remaining CAR copy rather than a removed or queued provider', () => {
  const car = {
    ...file,
    importedCar: true,
    datasetIds: ['1', '2'],
    serviceURLs: ['https://removed.example', 'https://active.example'],
  }
  expect(fileShareLink({ ...car, removedCopies: ['1'] })).toBe('https://active.example/piece/bafk-piece')
  expect(fileShareLink({ ...car, removalQueuedCopies: ['1'] })).toBe('https://active.example/piece/bafk-piece')
})
