import { beforeEach, expect, it } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { addCachedPiece, getCachedPieces, mergeStorageCopies, setCachedPieces } from './piece-cache.ts'

const scope = '314:checkpoint-review'
const file = {
  id: 'task',
  fileName: 'one.txt',
  fileSize: '1 B',
  cid: 'root',
  pieceCid: 'piece',
  datasetId: '',
  datasetIds: [],
  providerId: '',
  providerName: '',
  serviceURL: '',
  transactionHash: '',
  network: 'mainnet',
  uploadedAt: 1,
  copyCount: 0,
  upload: {
    phase: 'confirming',
    expectedCopies: 2,
    steps: [],
    checks: 0,
    nextCheckAt: 0,
    providers: [
      { providerId: '1', serviceURL: 'https://one.example', stored: true, transactionHash: '0x1' },
      { providerId: '2', serviceURL: 'https://two.example', transactionHash: '0x2' },
    ],
  },
} satisfies DatasetPiece
beforeEach(() => setCachedPieces(scope, []))
it.each([1, 2])('retains %s indexed confirmations when a delayed upload checkpoint arrives', async (copies) => {
  const indexed: DatasetPiece = {
    ...file,
    datasetId: '10',
    pieceId: 8,
    copyCount: copies,
    datasetIds: copies === 1 ? ['10'] : ['10', '20'],
    pieceIds: copies === 1 ? ['8'] : ['8', '9'],
    providerIds: copies === 1 ? ['1'] : ['1', '2'],
    upload: {
      ...file.upload,
      phase: copies === 2 ? 'complete' : 'confirming',
      providers: file.upload.providers.map((provider, index) =>
        index < copies
          ? { ...provider, confirmed: true, dataSetId: index === 0 ? '10' : '20', pieceId: index === 0 ? '8' : '9' }
          : provider
      ),
    },
  }
  setCachedPieces(scope, [indexed])
  await addCachedPiece(scope, { ...file, upload: { ...file.upload, phase: 'pending' } })
  const saved = getCachedPieces(scope)?.[0]
  expect(saved?.copyCount).toBe(copies)
  expect(saved?.upload?.providers.filter((provider) => provider.confirmed)).toHaveLength(copies)
  expect(saved?.upload?.providers[0].pieceId).toBe('8')
  if (copies === 2) expect(saved?.upload?.phase).toBe('complete')
})

it('does not promote an unbound pending hash to an API-recovered dataset across repeated cache saves', () => {
  const pending: DatasetPiece = {
    ...file,
    providerId: '1',
    transactionHash: '0x1',
    transactionHashes: [],
    upload: {
      ...file.upload,
      providers: [file.upload.providers[0], { providerId: '2', serviceURL: 'https://two.example' }],
    },
  }
  const recovered: DatasetPiece = {
    ...file,
    upload: undefined,
    datasetId: '20',
    datasetIds: ['20'],
    providerId: '2',
    providerIds: ['2'],
    pieceId: 9,
    transactionHash: '',
  }
  const merged = mergeStorageCopies(pending, recovered)
  expect(merged.transactionHash).toBe('')
  expect(merged.transactionHashes).toEqual([''])
  expect(merged.upload?.providers[0].transactionHash).toBe('0x1')
  const resaved = mergeStorageCopies(merged, recovered)
  expect(resaved.transactionHash).toBe('')
  expect(resaved.transactionHashes).toEqual([''])
})

it('rejects a stale per-copy hash when its saved receipt belongs to a different provider', () => {
  const wrong: DatasetPiece = {
    ...file,
    datasetId: '20',
    datasetIds: ['20'],
    providerId: '2',
    providerIds: ['2'],
    transactionHash: '0x1',
    transactionHashes: ['0x1'],
  }
  const recovered: DatasetPiece = { ...wrong, upload: undefined, transactionHash: '', transactionHashes: [''] }
  const merged = mergeStorageCopies(wrong, recovered)
  expect(merged.transactionHashes).toEqual(['0x2'])
  expect(merged.transactionHash).toBe('0x2')
})

it('does not attach a rejected submission hash to a confirmed indexed copy', () => {
  const rejected: DatasetPiece = {
    ...file,
    datasetId: '10',
    datasetIds: ['10'],
    providerId: '1',
    providerIds: ['1'],
    transactionHash: '0x1',
    transactionHashes: ['0x1'],
    upload: { ...file.upload, providers: [{ ...file.upload.providers[0], dataSetId: '10', rejected: true }] },
  }
  const indexed: DatasetPiece = { ...rejected, upload: undefined, transactionHash: '', transactionHashes: [''] }
  const merged = mergeStorageCopies(rejected, indexed)
  expect(merged.transactionHashes).toEqual([''])
  expect(merged.transactionHash).toBe('')
})
