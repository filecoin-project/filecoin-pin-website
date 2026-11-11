import { expect, it } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import {
  canDecryptPreview,
  canPreviewFile,
  decryptPreviewMimeType,
  fileShareLink,
  previewMimeType,
} from './file-links.ts'

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

it('previews any stored format and lets the gateway serve it without forcing a download', () => {
  const archive = { ...file, fileName: 'installer.dmg' }
  expect(canPreviewFile(archive)).toBe(true)
  const url = new URL(fileShareLink(archive) as string)
  expect(url.hostname).toBe(`${cid}.ipfs.inbrowser.link`)
  expect(url.searchParams.has('download')).toBe(false)
  expect(url.searchParams.get('filename')).toBe(archive.fileName)
})

it('withholds preview until both the root CID and a stored piece are known', () => {
  expect(canPreviewFile({ ...file, cid: '' })).toBe(false)
  expect(canPreviewFile({ ...file, pieceCid: '' })).toBe(false)
  expect(canPreviewFile({ ...file, isDirectory: true })).toBe(false)
})

it('withholds gateway links while the root CID is known-unindexed, keeping CAR shares provider-direct', () => {
  const unindexed = { ...file, ipfsIndexed: false }
  expect(canPreviewFile(unindexed)).toBe(false)
  expect(fileShareLink(unindexed)).toBeUndefined()
  expect(fileShareLink({ ...unindexed, importedCar: true })).toBe('https://sp.example/piece/bafk-piece')
  expect(canPreviewFile({ ...file, ipfsIndexed: true })).toBe(true)
})

it('shares the exact CAR piece rather than reconstructing its first IPFS root', () => {
  const car = { ...file, importedCar: true, serviceURLs: ['', 'bad url', 'https://sp.example/piece/old'] }
  expect(canPreviewFile(car)).toBe(false)
  expect(fileShareLink(car)).toBe('https://sp.example/piece/bafk-piece')
})

it('does not invent links for missing roots or provider URLs, and keeps removed files unshareable', () => {
  expect(fileShareLink({ ...file, cid: '' })).toBeUndefined()
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

it('offers Markdown preview and shares its preview link, including directory entries', () => {
  for (const fileName of ['README.md', 'notes.markdown', 'README.MD']) {
    const markdown = {
      ...file,
      fileName,
      directoryEntry: { rootCid: cid, path: `docs/${fileName}` },
    }
    expect(canPreviewFile(markdown)).toBe(true)
    const url = new URL(fileShareLink(markdown) as string)
    expect(url.hostname).toBe(`${cid}.ipfs.inbrowser.link`)
    expect(url.searchParams.get('filename')).toBe(fileName)
    expect(url.searchParams.has('download')).toBe(false)
  }
})

const pendingCar = {
  ...file,
  importedCar: true,
  ipfsIndexed: false,
  datasetId: '',
  datasetIds: [],
  serviceURLs: [],
  copyCount: 0,
  upload: {
    phase: 'confirming',
    expectedCopies: 2,
    providers: [{ providerId: '4', serviceURL: 'https://stored.example', stored: true }],
    steps: [],
    checks: 0,
    nextCheckAt: 0,
  },
} satisfies DatasetPiece

it('shares a stored CAR before any onchain or IPNI confirmation', () => {
  expect(fileShareLink(pendingCar)).toBe('https://stored.example/piece/bafk-piece')
})

it.each([false, undefined])('does not share an upload provider without stored confirmation (%s)', (stored) => {
  expect(
    fileShareLink({
      ...pendingCar,
      upload: { ...pendingCar.upload, providers: [{ ...pendingCar.upload.providers[0], stored }] },
    })
  ).toBeUndefined()
})

it('prefers a confirmed CAR copy over a stored upload provider', () => {
  expect(fileShareLink({ ...pendingCar, datasetIds: ['1'], serviceURLs: ['https://confirmed.example'] })).toBe(
    'https://confirmed.example/piece/bafk-piece'
  )
})

it('skips invalid and removal-scheduled upload providers when sharing a CAR', () => {
  expect(
    fileShareLink({
      ...pendingCar,
      serviceURLs: ['bad url'],
      removedCopies: ['1'],
      removalQueuedCopies: ['2'],
      deletion: { '3': { confirmed: true, transactionHash: '0x123' } },
      upload: {
        ...pendingCar.upload,
        providers: [
          { providerId: '0', serviceURL: 'javascript:alert(1)', stored: true },
          { providerId: '1', dataSetId: '1', serviceURL: 'https://removed.example', stored: true },
          { providerId: '2', dataSetId: '2', serviceURL: 'https://queued.example', stored: true },
          { providerId: '3', dataSetId: '3', serviceURL: 'https://scheduled.example', stored: true },
          ...pendingCar.upload.providers,
        ],
      },
    })
  ).toBe('https://stored.example/piece/bafk-piece')
})

it('never hands out gateway links or gateway previews for encrypted pieces', () => {
  // A gateway URL to an encrypted piece serves the raw envelope (ciphertext):
  // never offer it as "the file". Sharing goes through keysmith share links.
  const encrypted = { ...file, encrypted: true, contentRootCid: 'bafy-inner' }
  expect(fileShareLink(encrypted)).toBeUndefined()
  expect(canPreviewFile(encrypted)).toBe(false)
  expect(fileShareLink({ ...encrypted, isDirectory: true })).toBeUndefined()
  expect(fileShareLink({ ...encrypted, importedCar: true })).toBeUndefined()
})

it('offers client-side decrypt preview for encrypted files the browser can render', () => {
  const encrypted = { ...file, encrypted: true }
  // Gateway preview stays off (ciphertext), but the browser holds the key.
  expect(canPreviewFile(encrypted)).toBe(false)
  expect(canDecryptPreview(encrypted)).toBe(true)
  expect(canDecryptPreview({ ...encrypted, fileName: 'installer.dmg' })).toBe(false)
  // HTML/SVG render same-origin when decrypted in-browser (no isolated gateway
  // origin the way plain previews get) — full script execution next to the
  // session vault. Never the default action for unvetted content.
  expect(canDecryptPreview({ ...encrypted, fileName: 'page.html' })).toBe(false)
  expect(canDecryptPreview({ ...encrypted, fileName: 'page.htm' })).toBe(false)
  expect(canDecryptPreview({ ...encrypted, fileName: 'icon.svg' })).toBe(false)
  expect(canDecryptPreview(file)).toBe(false)
  expect(canDecryptPreview({ ...encrypted, isDirectory: true })).toBe(false)
  expect(canDecryptPreview({ ...encrypted, importedCar: true })).toBe(false)
})

it('types preview blobs so the browser renders them instead of downloading', () => {
  expect(previewMimeType('photo.PNG')).toBe('image/png')
  expect(previewMimeType('paper.pdf')).toBe('application/pdf')
  expect(previewMimeType('notes.md')).toBe('text/plain')
  expect(previewMimeType('data.json')).toBe('application/json')
  expect(previewMimeType('clip.mp4')).toBe('video/mp4')
  // QuickTime (.mov) is deliberately excluded: Chromium doesn't decode it
  // for a direct blob-URL navigation, so "preview" would silently download
  // instead of opening in the tab — worse than the honest disabled state.
  expect(previewMimeType('IMG_4282.mov')).toBeUndefined()
  expect(previewMimeType('page.html')).toBe('text/html')
  expect(previewMimeType('installer.dmg')).toBeUndefined()
})

it('withholds script-executing formats from the same-origin decrypt preview, unlike the cross-origin gateway preview', () => {
  // The gateway path is safe for these (separate origin per CID); the
  // decrypt-preview path renders on Drive's own origin, so these would
  // execute with full access to the session vault.
  expect(previewMimeType('page.html')).toBe('text/html')
  expect(previewMimeType('icon.svg')).toBe('image/svg+xml')
  expect(decryptPreviewMimeType('page.html')).toBeUndefined()
  expect(decryptPreviewMimeType('page.htm')).toBeUndefined()
  expect(decryptPreviewMimeType('icon.svg')).toBeUndefined()
  // Everything else decrypt-previews exactly like the gateway map.
  expect(decryptPreviewMimeType('photo.PNG')).toBe('image/png')
  expect(decryptPreviewMimeType('notes.md')).toBe('text/plain')
})
