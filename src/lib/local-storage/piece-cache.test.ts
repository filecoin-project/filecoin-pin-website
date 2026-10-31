import { beforeEach, expect, it } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { addCachedPiece, getCachedPieces, setCachedPieces } from './piece-cache.ts'

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
