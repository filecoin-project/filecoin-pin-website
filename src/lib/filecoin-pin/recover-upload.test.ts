import { WaitForAddPiecesRejectedError } from '@filoz/synapse-core/errors'
import type { Synapse } from '@filoz/synapse-sdk'
import { beforeEach, expect, it, vi } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { recoverUpload } from './recover-upload.ts'

const mocks = vi.hoisted(() => ({ add: vi.fn(), create: vi.fn(), find: vi.fn() }))
vi.mock('@filoz/synapse-core/sp', () => ({ waitForAddPieces: mocks.add, waitForCreateDataSetAddPieces: mocks.create }))
vi.mock('@filoz/synapse-core/pdp-verifier', () => ({ findPieceIdsByCid: mocks.find }))
const synapse = { readClient: {} } as Synapse
const file = {
  fileSize: '1 B',
  providerName: '',
  providerId: '',
  serviceURL: '',
  transactionHash: '',
  network: 'mainnet',
  uploadedAt: 1,
  id: 'pending',
  fileName: 'file.txt',
  pieceCid: 'bafkzcibcd4bdomn3tgwgrh3g532zopskstnbrd2n3sxfqbze7rxt7vqn7veigmy',
  cid: 'root',
  datasetId: '',
  datasetIds: [],
  copyCount: 0,
  upload: {
    phase: 'pending',
    expectedCopies: 1,
    steps: [],
    checks: 0,
    nextCheckAt: 0,
    providers: [
      { providerId: '4', serviceURL: 'https://sp.example', dataSetId: '10', stored: true, transactionHash: '0x123' },
    ],
  },
} satisfies DatasetPiece
beforeEach(() => {
  vi.resetAllMocks()
  mocks.find.mockResolvedValue({ items: [8n], nextCursor: undefined })
})
it('uses the matching piece ID from a batched confirmation, not the first ID', async () => {
  mocks.add.mockResolvedValue({ dataSetId: 10n, confirmedPieceIds: [7n, 8n], confirmedTxHash: '0x456' })
  const result = await recoverUpload(synapse, file, new AbortController().signal)
  expect(result.pieceId).toBe(8)
  expect(result.copyCount).toBe(1)
  expect(result.upload?.phase).toBe('complete')
  expect(result.transactionHash).toBe('0x456')
  expect(mocks.add.mock.calls[0][0].statusUrl).toBe('https://sp.example/pdp/data-sets/10/pieces/added/0x123')
})
it('keeps timeouts and missing receipts pending rather than reporting failure', async () => {
  mocks.add.mockRejectedValue(new Error('Request timed out'))
  const result = await recoverUpload(synapse, file, new AbortController().signal)
  expect(result.upload?.phase).toBe('pending')
  expect(result.datasetIds).toEqual([])
  expect(result.upload?.providers[0].transactionHash).toBe('0x123')
})
it('uses the SDK create-and-add status reader for a newly created dataset', async () => {
  const pending: DatasetPiece = structuredClone(file)
  if (!pending.upload) throw new Error('Missing fixture checkpoint')
  delete pending.upload.providers[0].dataSetId
  mocks.create.mockResolvedValue({ dataSetId: 10n, piecesIds: [8n] })
  const result = await recoverUpload(synapse, pending, new AbortController().signal)
  expect(mocks.create.mock.calls[0][0].statusUrl).toBe('https://sp.example/pdp/data-sets/created/0x123')
  expect(result.datasetId).toBe('10')
})
it('does not invent a submission or resubmit when the page closed before a hash was saved', async () => {
  const pending: DatasetPiece = structuredClone(file)
  if (!pending.upload) throw new Error('Missing fixture checkpoint')
  delete pending.upload.providers[0].transactionHash
  const result = await recoverUpload(synapse, pending, new AbortController().signal)
  expect(result.upload?.phase).toBe('interrupted')
  expect(result.upload?.error).toContain('cannot resume unfinished upload steps')
  expect(mocks.add).not.toHaveBeenCalled()
  expect(mocks.create).not.toHaveBeenCalled()
})
it('marks explicit provider rejection as failure, while preserving another confirmed copy', async () => {
  mocks.add.mockRejectedValue(
    new WaitForAddPiecesRejectedError({
      txHash: '0x123',
      txStatus: 'rejected',
      dataSetId: 10n,
      pieceCount: 1,
      addMessageOk: null,
      piecesAdded: false,
    })
  )
  expect((await recoverUpload(synapse, file, new AbortController().signal)).upload?.phase).toBe('failed')
  const partial: DatasetPiece = structuredClone(file)
  partial.upload?.providers.push({
    providerId: '5',
    serviceURL: 'https://other.example',
    confirmed: true,
    dataSetId: '11',
    pieceId: '2',
  })
  const result = await recoverUpload(synapse, partial, new AbortController().signal)
  expect(result.upload?.phase).toBe('complete')
  expect(result.datasetIds).toEqual(['11'])
})
it('retains an interrupted file record when no stored piece was saved', async () => {
  const result = await recoverUpload(synapse, { ...file, pieceCid: '' }, new AbortController().signal)
  expect(result.upload?.phase).toBe('interrupted')
  expect(mocks.add).not.toHaveBeenCalled()
})

it('keeps checking submitted copies without pretending unsubmitted copies are running', async () => {
  const partial: DatasetPiece = structuredClone(file)
  partial.upload?.providers.push({ providerId: '5', serviceURL: 'https://secondary.example' })
  mocks.add.mockRejectedValue(new Error('timeout'))
  const pending = await recoverUpload(synapse, partial, new AbortController().signal)
  expect(pending.upload?.phase).toBe('pending')
  expect(pending.upload?.error).toContain('Background upload work has stopped')
  mocks.add.mockResolvedValue({ dataSetId: 10n, confirmedPieceIds: [8n] })
  const checked = await recoverUpload(synapse, pending, new AbortController().signal)
  expect(checked.copyCount).toBe(1)
  expect(checked.upload?.phase).toBe('interrupted')
})
