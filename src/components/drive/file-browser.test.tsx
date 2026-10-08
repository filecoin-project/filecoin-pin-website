import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { UploadHistoryProvider } from '../../context/upload-history-context.tsx'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { getCachedPieces, setCachedPieces } from '../../lib/local-storage/piece-cache.ts'
import { FileBrowser, fileStatus } from './file-browser.tsx'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  receipt: vi.fn(),
  permissions: vi.fn(),
  uploading: vi.fn(),
  submit: vi.fn(),
}))
const scope = '314:0x1111111111111111111111111111111111111111'
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    storageScope: scope,
    wallet: { status: 'ready', data: { address: scope.slice(4), network: 'mainnet' } },
    synapse: { storage: { createContext: mocks.context } },
    dataSet: { status: 'ready', dataSetIds: [1n, 2n] },
    ensurePermissions: mocks.permissions,
    addDataSetId: vi.fn(),
  }),
}))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({
    address: scope.slice(4),
    network: 'mainnet',
    session: {},
    busy: false,
    uploading: false,
    setUploading: mocks.uploading,
  }),
}))
vi.mock('../../lib/filecoin-pin/browser-wallet.ts', () => ({
  publicClient: () => ({ waitForTransactionReceipt: mocks.receipt }),
}))
vi.mock('@filoz/synapse-core/pdp-verifier', () => ({ findPieceIdsByCid: async () => ({ items: [1n] }) }))

const hash = `0x${'a'.repeat(64)}`
const file = {
  id: 'first',
  fileName: 'first.txt',
  fileSize: '1 B',
  cid: 'bafkreigh2akiscaildcgck5x5wqlooqkztdxqv5t5uwmybnv5brkw4zj3m',
  pieceCid: 'bafkzcibcd4bdomn3tgwgrh3g532zopskstnbrd2n3sxfqbze7rxt7vqn7veigmy',
  datasetId: '1',
  datasetIds: ['1'],
  providerId: '1',
  providerName: 'Provider',
  serviceURL: '',
  transactionHash: '',
  network: 'mainnet',
  uploadedAt: 1,
  pieceId: 1,
} satisfies DatasetPiece
beforeEach(() => {
  vi.resetAllMocks()
  mocks.permissions.mockResolvedValue(undefined)
  mocks.receipt.mockResolvedValue({ status: 'success' })
  mocks.submit.mockResolvedValue(hash)
  setCachedPieces(scope, [file, { ...file, id: 'second', fileName: 'second.txt', datasetId: '2', datasetIds: ['2'] }])
})

it('resumes deletion of shared content through details even when the selected record is already scheduled', async () => {
  mocks.context.mockImplementation(async ({ dataSetId }) => {
    if (dataSetId === 2n) throw new Error('second provider unavailable')
    return { deletePieces: mocks.submit, getScheduledRemovals: async () => [] }
  })
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
  expect(screen.getByLabelText('Piece CID')).toHaveProperty('value', file.pieceCid)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }))
  await within(screen.getByRole('dialog')).findByText('second provider unavailable')
  expect(getCachedPieces(scope)?.[0].deletion?.['1'].confirmed).toBe(true)
  const retry = screen.getByRole('button', { name: 'Continue deletion' })
  expect(retry).toHaveProperty('disabled', false)
  mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
  fireEvent.click(retry)
  await waitFor(() => expect(getCachedPieces(scope)?.[1].deletion?.['2'].confirmed).toBe(true))
  expect(mocks.submit).toHaveBeenCalledTimes(2)
  expect(mocks.permissions).toHaveBeenCalledTimes(2)
  await waitFor(() => expect(retry).toHaveProperty('disabled', true))
})

it('schedules a later identical upload instead of reusing an older alias’s deletion receipt', async () => {
  const oldHash = `0x${'b'.repeat(64)}`
  setCachedPieces(scope, [
    { ...file, deletion: { '1': { transactionHash: oldHash, confirmed: true } } },
    { ...file, id: 'later', fileName: 'later.txt', pieceId: 2 },
  ])
  mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'later.txt' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue deletion' }))
  await waitFor(() =>
    expect(getCachedPieces(scope)?.find((file) => file.id === 'later')?.deletion?.['1'].confirmed).toBe(true)
  )
  expect(mocks.submit).toHaveBeenCalledOnce()
  expect(getCachedPieces(scope)?.every((file) => file.deletion?.['1'].transactionHash === hash)).toBe(true)
})

it('distinguishes pending indexing from stopped checks without treating storage as failed', () => {
  expect(fileStatus({ ...file, ipfsIndexed: false, ipfsCheckAttempts: 4 })).toBe('Stored · IPFS indexing pending')
  expect(fileStatus({ ...file, ipfsIndexed: false, ipfsCheckAttempts: 5 })).toBe('Stored · IPFS indexing unconfirmed')
  expect(fileStatus({ ...file, ipfsIndexed: true, ipfsCheckAttempts: 5 })).toBe('Stored')
  expect(fileStatus({ ...file, cid: '', ipfsIndexed: false })).toBe('Metadata missing')
  expect(
    fileStatus({ ...file, ipfsIndexed: false, deletion: { '1': { confirmed: true, transactionHash: hash } } })
  ).toBe('Deletion scheduled')
})
