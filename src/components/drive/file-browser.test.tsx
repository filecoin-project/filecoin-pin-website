import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { WaitForTransactionReceiptTimeoutError } from 'viem'
import { beforeEach, expect, it, vi } from 'vitest'
import { UploadHistoryProvider } from '../../context/upload-history-context.tsx'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import {
  addCachedPiece,
  getCachedPieces,
  mutateCachedPieces,
  setCachedPieces,
} from '../../lib/local-storage/piece-cache.ts'
import { customerStatus } from '../../utils/upload/file-status.ts'
import { FileBrowser, fileStatus } from './file-browser.tsx'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  index: vi.fn(),
  receipt: vi.fn(),
  getReceipt: vi.fn(),
  rpc: vi.fn(),
  permissions: vi.fn(),
  uploading: vi.fn(),
  deleting: vi.fn(),
  submit: vi.fn(),
  download: vi.fn(),
  uploadInProgress: false,
  hasSession: true,
  autoChecking: new Set<string>(),
}))
vi.mock('../../hooks/use-deletion-recovery.ts', () => ({ useDeletionRecovery: () => mocks.autoChecking }))
const scope = '314:0x1111111111111111111111111111111111111111'
vi.mock('../../lib/filecoin-pin/drive-api.ts', async (original) => ({
  ...(await original<object>()),
  loadDriveFiles: mocks.index,
}))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    storageScope: scope,
    wallet: { status: 'ready', data: { address: scope.slice(4), network: 'mainnet' } },
    synapse: { storage: { createContext: mocks.context } },
    dataSet: { status: 'ready', dataSetIds: [1n, 2n] },
    ensurePermissions: mocks.permissions,
    addDataSetId: vi.fn(),
    encryption: { ready: false },
  }),
}))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({
    address: scope.slice(4),
    network: 'mainnet',
    session: mocks.hasSession ? {} : null,
    busy: false,
    uploading: mocks.uploadInProgress,
    setUploading: mocks.uploading,
    setDeleting: mocks.deleting,
  }),
}))
vi.mock('../../lib/filecoin-pin/browser-wallet.ts', () => ({
  publicClient: () => ({
    waitForTransactionReceipt: mocks.receipt,
    getTransactionReceipt: mocks.getReceipt,
    request: mocks.rpc,
  }),
}))
vi.mock('@filoz/synapse-core/pdp-verifier', () => ({ findPieceIdsByCid: async () => ({ items: [1n] }) }))
vi.mock('../../lib/filecoin-pin/download.ts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadFile: mocks.download,
}))

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
  mocks.getReceipt.mockResolvedValue(null)
  mocks.rpc.mockResolvedValue(null)
  mocks.index.mockResolvedValue([])
  mocks.autoChecking = new Set()
  mocks.hasSession = true
  mocks.uploadInProgress = false
  mocks.permissions.mockResolvedValue(undefined)
  mocks.receipt.mockResolvedValue({ status: 'success' })
  mocks.submit.mockResolvedValue(hash)
  setCachedPieces(scope, [file, { ...file, id: 'second', fileName: 'second.txt', datasetId: '2', datasetIds: ['2'] }])
})

it.each(['table', 'details'] as const)(
  'downloads from %s during an upload without releasing the upload lock',
  async (entry) => {
    mocks.uploadInProgress = true
    let finish!: () => void
    mocks.download.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    render(
      <UploadHistoryProvider>
        <FileBrowser folder="" onFolderChange={vi.fn()} />
      </UploadHistoryProvider>
    )
    const fileButton = await screen.findByRole('button', { name: 'first.txt' })
    if (entry === 'details') fireEvent.click(fileButton)
    const download =
      entry === 'details'
        ? screen.getByRole('button', { name: 'Download original file' })
        : within(fileButton.closest('tr') as HTMLElement).getByRole('button', { name: 'Download' })
    expect(download).toHaveProperty('disabled', false)
    fireEvent.click(download)
    fireEvent.click(download)
    expect(mocks.download).toHaveBeenCalledOnce()
    expect(download).toHaveProperty('disabled', true)
    await act(async () => finish())
    await waitFor(() => expect(download).toHaveProperty('disabled', false))
    expect(mocks.uploading).not.toHaveBeenCalled()
  }
)

it('allows retrying a failed download while the upload remains active', async () => {
  mocks.uploadInProgress = true
  mocks.download.mockRejectedValueOnce(new Error('Provider unavailable')).mockResolvedValue(undefined)
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  const fileButton = await screen.findByRole('button', { name: 'first.txt' })
  const download = within(fileButton.closest('tr') as HTMLElement).getByRole('button', { name: 'Download' })
  fireEvent.click(download)
  await screen.findByText(/Provider unavailable/)
  expect(download).toHaveProperty('disabled', false)
  fireEvent.click(download)
  await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(download).toHaveProperty('disabled', false))
  expect(mocks.uploading).not.toHaveBeenCalled()
})

it('keeps Upload available while downloading an existing file', async () => {
  let finish!: () => void
  mocks.download.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const upload = vi.fn()
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} onUpload={upload} />
    </UploadHistoryProvider>
  )
  const fileButton = await screen.findByRole('button', { name: 'first.txt' })
  fireEvent.click(within(fileButton.closest('tr') as HTMLElement).getByRole('button', { name: 'Download' }))
  const button = screen.getByRole('button', { name: 'Upload files' })
  expect(button).toHaveProperty('disabled', false)
  fireEvent.click(button)
  expect(upload).toHaveBeenCalledOnce()
  await act(async () => finish())
})

it('shows queued files and lets users cancel from details or the queue list', async () => {
  let finish!: () => void
  mocks.download.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  const first = await screen.findByRole('button', { name: 'first.txt' })
  const second = screen.getByRole('button', { name: 'second.txt' })
  fireEvent.click(within(first.closest('tr') as HTMLElement).getByRole('button', { name: 'Download' }))
  fireEvent.click(within(second.closest('tr') as HTMLElement).getByRole('button', { name: 'Download' }))
  expect(mocks.download).toHaveBeenCalledOnce()
  expect(within(second.closest('tr') as HTMLElement).getByText('Queued · Cancel')).toBeTruthy()
  fireEvent.click(second)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel queued download' }))
  expect(screen.getByRole('button', { name: 'Download original file' })).toHaveProperty('disabled', false)
  fireEvent.click(screen.getByRole('button', { name: 'Download original file' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
  const queue = screen.getByRole('list', { name: 'Queued downloads', hidden: true })
  fireEvent.click(within(queue).getByRole('button', { name: 'Cancel queued download for second.txt', hidden: true }))
  expect(screen.queryByRole('list', { name: 'Queued downloads', hidden: true })).toBeNull()
  await act(async () => finish())
  expect(mocks.download).toHaveBeenCalledOnce()
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
  expect(screen.getByRole('button', { name: 'second.txt', hidden: true })).toBeTruthy()
  expect(screen.getByText(/· Deleting…/)).toBeTruthy()
  expect(screen.getAllByLabelText('Deleting…').length).toBeGreaterThan(0)
  const retry = screen.getByRole('button', { name: 'Continue deletion' })
  expect(retry).toHaveProperty('disabled', false)
  mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
  fireEvent.click(retry)
  await waitFor(() => expect(getCachedPieces(scope)?.[1].deletion?.['2'].confirmed).toBe(true))
  expect(mocks.submit).toHaveBeenCalledTimes(2)
  expect(mocks.permissions).toHaveBeenCalledTimes(2)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.queryByRole('button', { name: 'first.txt' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'second.txt' })).toBeNull()
  expect(screen.queryByText(/Removed from the file list/)).toBeNull()
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
  fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }))
  await waitFor(() =>
    expect(getCachedPieces(scope)?.find((file) => file.id === 'later')?.deletion?.['1'].confirmed).toBe(true)
  )
  expect(mocks.submit).toHaveBeenCalledOnce()
  expect(getCachedPieces(scope)?.find((file) => file.id === 'first')?.deletion?.['1'].transactionHash).toBe(oldHash)
  expect(getCachedPieces(scope)?.find((file) => file.id === 'later')?.deletion?.['1'].transactionHash).toBe(hash)
})

it('keeps indexing progress out of the stored-file status', () => {
  expect(fileStatus({ ...file, ipfsIndexed: false, ipfsCheckAttempts: 4 })).toBe('Stored')
  expect(fileStatus({ ...file, ipfsIndexed: false, ipfsCheckAttempts: 5 })).toBe('Stored')
  expect(fileStatus({ ...file, ipfsIndexed: true, ipfsCheckAttempts: 5 })).toBe('Stored')
  expect(fileStatus({ ...file, cid: '', ipfsIndexed: false })).toBe('Metadata missing')
  expect(
    fileStatus({ ...file, ipfsIndexed: false, deletion: { '1': { confirmed: true, transactionHash: hash } } })
  ).toBe('Deletion scheduled')
})

it('collapses internal states into the customer vocabulary', () => {
  const upload: NonNullable<DatasetPiece['upload']> = {
    phase: 'waiting',
    expectedCopies: 2,
    providers: [],
    steps: [],
    checks: 0,
    nextCheckAt: 0,
  }
  expect(customerStatus({ ...file, copyCount: 0, upload })).toBe('Waiting')
  expect(customerStatus({ ...file, copyCount: 0, upload: { ...upload, phase: 'pending' } })).toBe('Uploading…')
  expect(customerStatus({ ...file, copyCount: 0, upload, ipfsIndexed: true })).toBe('Waiting')
  expect(customerStatus({ ...file, copyCount: 0, pieceCid: '', upload, ipfsIndexed: true })).toBe('Waiting')
  expect(customerStatus({ ...file, copyCount: 0, upload: { ...upload, phase: 'failed' } })).toBe('Upload failed')
  expect(customerStatus({ ...file, copyCount: 0, upload: { ...upload, phase: 'interrupted' } })).toBe('Upload failed')
  expect(customerStatus({ ...file, ipfsIndexed: false })).toBe('Stored')
  expect(customerStatus({ ...file, ipfsIndexed: true })).toBe('Stored')
  expect(customerStatus(file)).toBe('Stored')
  expect(customerStatus({ ...file, copyCount: 1, upload: { ...upload, phase: 'pending' } })).toBe('Stored')
  expect(customerStatus({ ...file, deletion: {} })).toBe('Deleting…')
  expect(customerStatus({ ...file, deletion: { '1': { confirmed: true, transactionHash: hash } } })).toBe('Deleting…')
})

it('keeps removed files hidden after restore and reload, but shows a new identical upload', async () => {
  const archived = { ...file, folderPath: 'old/nested', deletion: { '1': { confirmed: true, transactionHash: hash } } }
  setCachedPieces(scope, [archived])
  const mount = () =>
    render(
      <UploadHistoryProvider>
        <FileBrowser folder="" onFolderChange={vi.fn()} />
      </UploadHistoryProvider>
    )
  const view = mount()
  await screen.findByText('No files here yet. Upload to this folder.')
  expect(screen.queryByRole('button', { name: 'first.txt' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'old' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'Files' })).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search file list' }), { target: { value: 'first' } })
  expect(screen.getByText('No matching files.')).toBeTruthy()
  expect(getCachedPieces(scope)?.[0].deletion).toEqual(archived.deletion)
  view.unmount()
  await addCachedPiece(scope, { ...file, id: 'new-upload', fileName: 'new.txt', uploadedAt: 2 })
  mount()
  expect(await screen.findByRole('button', { name: 'new.txt' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'first.txt' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'Files' })).toBeTruthy()
  expect(getCachedPieces(scope)).toHaveLength(2)
  expect(getCachedPieces(scope)?.find((record) => record.id === 'new-upload')?.deletion).toBeUndefined()
})

it.each(['archived', 'partial'] as const)(
  'checks the current pending removal when an older %s record has a confirmed receipt',
  async (older) => {
    const oldHash = `0x${'b'.repeat(64)}`
    const otherHash = `0x${'c'.repeat(64)}`
    const archived = { ...file, deletion: { '1': { transactionHash: oldHash, confirmed: true } } }
    const previous =
      older === 'archived'
        ? archived
        : {
            ...archived,
            datasetIds: ['1', '2'],
            deletion: { ...archived.deletion, '2': { transactionHash: otherHash, confirmed: false } },
          }
    setCachedPieces(scope, [
      previous,
      {
        ...file,
        id: 'later',
        fileName: 'later.txt',
        deletion: { '1': { transactionHash: hash, confirmed: false } },
      },
    ])
    render(
      <UploadHistoryProvider>
        <FileBrowser folder="" onFolderChange={vi.fn()} />
      </UploadHistoryProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'later.txt' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue deletion' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'later.txt' })).toBeNull())
    expect(mocks.receipt).toHaveBeenCalledWith({ hash, checkReplacement: false })
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(getCachedPieces(scope)?.find((record) => record.id === 'later')?.deletion?.['1'].confirmed).toBe(true)
    if (older === 'archived')
      expect(getCachedPieces(scope)?.find((record) => record.id === 'first')?.deletion?.['1'].transactionHash).toBe(
        oldHash
      )
  }
)

it('preserves the archive while a new removal reverts and can be submitted again', async () => {
  const oldHash = `0x${'b'.repeat(64)}`
  setCachedPieces(scope, [
    { ...file, deletion: { '1': { transactionHash: oldHash, confirmed: true } } },
    { ...file, id: 'later', fileName: 'later.txt', deletion: { '1': { transactionHash: hash, confirmed: false } } },
  ])
  mocks.receipt.mockResolvedValueOnce({ status: 'reverted' })
  mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'later.txt' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue deletion' }))
  await within(screen.getByRole('dialog')).findByText(
    'Deletion transaction reverted for dataset 1. Retry to submit again.'
  )
  expect(getCachedPieces(scope)?.find((record) => record.id === 'later')?.deletion?.['1']).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Continue deletion' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(mocks.submit).toHaveBeenCalledOnce()
  expect(getCachedPieces(scope)?.find((record) => record.id === 'first')?.deletion?.['1'].transactionHash).toBe(oldHash)
  expect(getCachedPieces(scope)?.find((record) => record.id === 'later')?.deletion?.['1'].confirmed).toBe(true)
})

it('does not hide a later identical upload when an older deletion receipt lookup is retried', async () => {
  setCachedPieces(scope, [file])
  mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
  mocks.receipt.mockRejectedValueOnce(new Error('Receipt lookup timed out'))
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }))
  await within(screen.getByRole('dialog')).findByText('Receipt lookup timed out')
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
  await act(async () => {
    await addCachedPiece(scope, { ...file, id: 'later', fileName: 'later.txt' })
  })
  fireEvent.click(await screen.findByRole('button', { name: 'later.txt' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue deletion' }))
  await within(screen.getByRole('dialog')).findByText(/Deletion progress saved/)
  expect(mocks.submit).toHaveBeenCalledOnce()
  expect(mocks.receipt).toHaveBeenCalledTimes(2)
  expect(getCachedPieces(scope)?.find((record) => record.id === 'later')?.deletion?.['1']).toEqual({
    transactionHash: hash,
    confirmed: true,
    remaining: true,
  })
  expect(screen.getByRole('button', { name: 'later.txt', hidden: true })).toBeTruthy()
})

it('preserves edits and later uploads made while a deletion receipt is pending', async () => {
  setCachedPieces(scope, [file])
  mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
  let confirm!: (receipt: { status: string }) => void
  mocks.receipt.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        confirm = resolve
      })
  )
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }))
  await waitFor(() => expect(mocks.receipt).toHaveBeenCalledOnce())
  await act(async () => {
    await addCachedPiece(scope, { ...file, id: 'later', fileName: 'later.txt', pieceId: 2 })
    await mutateCachedPieces(scope, (current) =>
      current.map((record) => (record.id === file.id ? { ...record, fileName: 'edited-during-deletion.txt' } : record))
    )
    confirm({ status: 'success' })
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.getByRole('button', { name: 'later.txt' })).toBeTruthy()
  expect(getCachedPieces(scope)?.find((record) => record.id === file.id)).toMatchObject({
    fileName: 'edited-during-deletion.txt',
    deletion: { '1': { confirmed: true } },
  })
  expect(getCachedPieces(scope)?.find((record) => record.id === 'later')?.deletion).toBeUndefined()
})

it('refuses deletion before submitting when directory locks are unavailable', async () => {
  setCachedPieces(scope, [file])
  mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
  const locks = navigator.locks
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  try {
    render(
      <UploadHistoryProvider>
        <FileBrowser folder="" onFolderChange={vi.fn()} />
      </UploadHistoryProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }))
    await within(screen.getByRole('dialog')).findByText(/cannot safely update the file directory/)
    expect(getCachedPieces(scope)?.[0].deletion).toBeUndefined()
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.permissions).not.toHaveBeenCalled()
  } finally {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: locks })
  }
})

it('blocks a second deletion tab, then resumes the latest progress after the first tab fails', async () => {
  setCachedPieces(scope, [{ ...file, datasetIds: ['1', '2'] }])
  const secondHash = `0x${'b'.repeat(64)}`
  mocks.submit.mockResolvedValueOnce(hash).mockResolvedValueOnce(secondHash)
  const provider = { deletePieces: mocks.submit, getScheduledRemovals: async () => [] }
  mocks.context
    .mockResolvedValueOnce(provider)
    .mockRejectedValueOnce(new Error('Provider unavailable'))
    .mockResolvedValue(provider)
  let confirm!: (value: { status: string }) => void
  mocks.receipt.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        confirm = resolve
      })
  )
  const a = render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  const b = render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await within(a.container).findByRole('button', { name: 'first.txt' }))
  const dialogA = screen.getByRole('dialog')
  fireEvent.click(within(dialogA).getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
  fireEvent.click(within(dialogA).getByRole('button', { name: 'Schedule deletion' }))
  await waitFor(() => expect(mocks.receipt).toHaveBeenCalledOnce())

  fireEvent.click(within(b.container).getByRole('button', { name: 'first.txt', hidden: true }))
  const dialogB = screen.getAllByRole('dialog', { hidden: true }).find((dialog) => dialog !== dialogA)
  if (!dialogB) throw new Error('Missing second tab dialog')
  fireEvent.click(within(dialogB).getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
  fireEvent.click(within(dialogB).getByRole('button', { name: 'Continue deletion' }))
  await within(dialogB).findByText(/being uploaded or deleted in this or another tab/)
  expect(mocks.submit).toHaveBeenCalledOnce()
  expect(mocks.receipt).toHaveBeenCalledOnce()
  await act(async () => confirm({ status: 'success' }))
  await within(dialogA).findByText('Provider unavailable')

  fireEvent.click(within(dialogB).getByRole('button', { name: 'Continue deletion', hidden: true }))
  await waitFor(() => expect(getCachedPieces(scope)?.[0].deletion?.['2']?.confirmed).toBe(true))
  expect(mocks.submit).toHaveBeenCalledTimes(2)
  expect(mocks.receipt).toHaveBeenCalledTimes(2)
  expect(getCachedPieces(scope)?.[0].deletion).toEqual({
    '1': { transactionHash: hash, confirmed: true },
    '2': { transactionHash: secondHash, confirmed: true },
  })
})

it.each([false, true])('keeps deletion running after closing details (failure: %s)', async (fails) => {
  setCachedPieces(scope, [file])
  let finish!: () => void
  mocks.submit.mockImplementation(
    () =>
      new Promise<string>((resolve, reject) => {
        finish = () => (fails ? reject(new Error('provider unavailable')) : resolve(hash))
      })
  )
  mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }))
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByLabelText('Deleting…')).toBeTruthy()
  expect(mocks.deleting).not.toHaveBeenCalledWith(false)
  await act(async () => finish())
  if (fails) {
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'first.txt: provider unavailable')
  } else {
    await waitFor(() =>
      expect(getCachedPieces(scope)?.every((record) => record.deletion?.[record.datasetId]?.confirmed)).toBe(true)
    )
    expect(screen.queryByText(/Removed from the file list/)).toBeNull()
  }
  expect(mocks.deleting).toHaveBeenLastCalledWith(false)
})

it.each([false, true])(
  'keeps unrelated actions available during deletion (upload active: %s)',
  async (uploadActive) => {
    mocks.uploadInProgress = uploadActive
    const other = {
      ...file,
      id: 'other',
      fileName: 'other.txt',
      pieceCid: 'other-piece',
      cid: 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe',
    }
    setCachedPieces(scope, [file, { ...file, id: 'alias', fileName: 'alias.txt' }, other])
    let finish!: (hash: string) => void
    mocks.submit.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        })
    )
    mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
    render(
      <UploadHistoryProvider>
        <FileBrowser folder="" onFolderChange={vi.fn()} onUpload={vi.fn()} />
      </UploadHistoryProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }))
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    const rowDownload = (name: string) =>
      within(screen.getByRole('button', { name }).closest('tr') as HTMLElement).getByRole('button', {
        name: 'Download',
      })
    expect(rowDownload('first.txt')).toHaveProperty('disabled', true)
    expect(rowDownload('alias.txt')).toHaveProperty('disabled', true)
    expect(rowDownload('other.txt')).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: 'Upload files' })).toHaveProperty('disabled', uploadActive)
    fireEvent.click(rowDownload('other.txt'))
    await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce())
    await act(async () => finish(hash))
  }
)

it('shows fallback CIDs without offering edits, backups or standalone folders', async () => {
  setCachedPieces(scope, [{ ...file, fileName: '', folderPath: 'reports/2026' }])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="reports/2026" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: file.cid }))
  expect(screen.getByRole('dialog').textContent).toContain(file.cid)
  expect(screen.queryByLabelText('Display name')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Export backup' })).toBeNull()
  expect(screen.queryByLabelText('New folder name')).toBeNull()
})

it('shows a partially queued deletion per provider and offers continuing the remaining copy', async () => {
  setCachedPieces(scope, [
    {
      ...file,
      datasetIds: ['1', '2'],
      providerIds: ['1', '2'],
      providerNames: ['First', 'Second'],
      pieceIds: ['1', '1'],
      copyCount: 2,
      removalQueuedCopies: ['1'],
      deletion: { '1': { transactionHash: hash, confirmed: true } },
    },
  ])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getAllByText('Removal scheduled')).toHaveLength(1)
  expect(dialog.getByRole('link', { name: 'Removal scheduled' }).getAttribute('href')).toContain(hash)
  expect(dialog.queryByText('Deletion scheduled', { exact: true })).toBeNull()
  expect(screen.getByRole('button', { name: 'Continue deletion' })).toBeTruthy()
  expect(screen.getByText(/· Deleting…/)).toBeTruthy()
})

it.each([false, true])('keeps original downloads without a gateway download link (CAR: %s)', async (importedCar) => {
  const fileName = importedCar ? 'archive.car' : 'image.png'
  setCachedPieces(scope, [{ ...file, importedCar, fileName }])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: fileName }))
  expect(screen.queryByRole('link', { name: /IPFS gateway/ })).toBeNull()
  expect(screen.getByRole('button', { name: 'Download original file' })).toBeTruthy()
  if (importedCar) expect(screen.getByRole('button', { name: 'Preview' })).toHaveProperty('disabled', true)
  else expect(screen.getByRole('link', { name: 'Preview' })).toBeTruthy()
  expect(screen.queryByText(/The gateway exports a new CAR/)).toBeNull()
})
it('names the real blocker when an encrypted file has no in-browser preview format, instead of the unrelated gateway/CAR copy', async () => {
  setCachedPieces(scope, [{ ...file, fileName: 'archive.zip', encrypted: true }])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'archive.zip' }))
  const preview = screen.getByRole('button', { name: 'Preview' })
  expect(preview).toHaveProperty('disabled', true)
  expect(preview.getAttribute('title')).toMatch(/no in-browser preview/i)
  expect(preview.getAttribute('title')).not.toMatch(/IPFS indexer|imported CAR/i)
})

it('names folders and imported CARs correctly rather than blaming format, when encrypted', async () => {
  setCachedPieces(scope, [
    { ...file, id: 'enc-dir', fileName: 'Photos', isDirectory: true, encrypted: true, cid: '' },
    { ...file, id: 'enc-car', fileName: 'backup.car', importedCar: true, encrypted: true },
  ])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  await screen.findByRole('checkbox', { name: 'Select Photos' })
  const photosRow = screen.getByRole('checkbox', { name: 'Select Photos' }).closest('tr') as HTMLElement
  fireEvent.click(within(photosRow).getByRole('button', { name: 'Details' }))
  expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('title')).toMatch(/folders have no/i)
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
  fireEvent.click(await screen.findByRole('button', { name: 'backup.car' }))
  expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('title')).toMatch(
    /imported car archives have no/i
  )
})

it.each([
  ['enabled', true],
  ['withheld', false],
] as const)(
  'keeps a stored copy downloadable while confirming, with gateway links %s by the IPNI signal',
  async (_label, ipfsIndexed) => {
    setCachedPieces(scope, [
      {
        ...file,
        fileName: 'FiSuite.mp4',
        copyCount: 1,
        ipfsIndexed,
        upload: { phase: 'pending', expectedCopies: 2, providers: [], steps: [], checks: 0, nextCheckAt: 0 },
      },
    ])
    render(
      <UploadHistoryProvider>
        <FileBrowser folder="" onFolderChange={vi.fn()} />
      </UploadHistoryProvider>
    )
    const row = (await screen.findByRole('button', { name: 'FiSuite.mp4' })).closest('tr')
    expect(row).toBeTruthy()
    if (!row) return
    expect(within(row).getByRole('button', { name: 'Share' })).toHaveProperty('disabled', !ipfsIndexed)
    fireEvent.click(within(row).getByRole('button', { name: 'FiSuite.mp4' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('button', { name: 'Download original file' })).toHaveProperty('disabled', false)
    if (ipfsIndexed) {
      expect(dialog.getByRole('link', { name: 'Preview' }).getAttribute('href')).toContain('.ipfs.inbrowser.link')
    } else {
      expect(dialog.getByRole('button', { name: 'Preview' })).toHaveProperty('disabled', true)
    }
  }
)

it('keeps the empty cache in a loading state, then offers retry after index failure', async () => {
  setCachedPieces(scope, [])
  let fail!: (error: Error) => void
  mocks.index.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject
      })
  )
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  expect(screen.queryByText('No files here yet. Upload to this folder.')).toBeNull()
  expect(screen.getByText('Loading your files…')).toBeTruthy()
  await act(async () => fail(new Error('Index temporarily unavailable')))
  expect(screen.getByText('Unable to load your files')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toBe('Unable to load your file list. Please try again.')
  expect(screen.queryByText('No files here yet. Upload to this folder.')).toBeNull()
  mocks.index.mockResolvedValueOnce([file])
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
  await screen.findByRole('button', { name: 'first.txt' })
  expect(screen.queryByRole('button', { name: 'Retry loading' })).toBeNull()
})

it('shows a confirmed empty directory only after a successful index response', async () => {
  setCachedPieces(scope, [])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  await screen.findByText('No files here yet. Upload to this folder.')
  expect(screen.queryByText('Loading your files…')).toBeNull()
})

it('retains files and upload access when the index is unavailable', async () => {
  mocks.index.mockRejectedValueOnce(new Error('Filecoin index unavailable (503)'))
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} onUpload={vi.fn()} />
    </UploadHistoryProvider>
  )
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toBe(
      'Unable to load the latest file list. Your existing list is still available.'
    )
  )
  expect(screen.getByRole('button', { name: 'first.txt' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Upload files' })).toHaveProperty('disabled', false)
  await act(async () => {
    await addCachedPiece(scope, { ...file, id: 'new-upload', fileName: 'new.txt' })
  })
  expect(screen.getByRole('button', { name: 'new.txt' })).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toBe(
    'Unable to load the latest file list. Your existing list is still available.'
  )
})

it('shows the save error when index retrieval succeeds but writing the cache fails', async () => {
  mocks.index.mockResolvedValueOnce([
    { ...file, id: 'indexed-new', fileName: 'recovered.txt', datasetId: '3', datasetIds: ['3'] },
  ])
  const original = localStorage.setItem.bind(localStorage)
  const write = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key.startsWith('filecoin-pin-piece-cache-v1-')) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    return original(key, value)
  })
  try {
    render(
      <UploadHistoryProvider>
        <FileBrowser folder="" onFolderChange={vi.fn()} />
      </UploadHistoryProvider>
    )
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Unable to save the browser directory.')
    )
    expect(screen.getByRole('alert').textContent).toContain('free browser storage and retry saving')
    write.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  } finally {
    write.mockRestore()
  }
})

it.each([
  ['pending', 'Confirming remaining copies.'],
  ['interrupted', 'Upload interrupted before all copies were confirmed.'],
  ['complete', 'Fewer copies stored than requested.'],
] as const)('keeps %s replication progress out of the list and shows it in details', async (phase, detail) => {
  setCachedPieces(scope, [
    {
      ...file,
      copyCount: 1,
      upload: { phase, expectedCopies: 2, providers: [], steps: [], checks: 0, nextCheckAt: 0 },
    },
  ])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  const row = (await screen.findByRole('button', { name: 'first.txt' })).closest('tr') as HTMLElement
  expect(within(row).queryByText('Stored')).toBeNull()
  expect(within(row).queryByText(/confirmed/)).toBeNull()
  expect(within(row).queryByLabelText('Uploading…')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'first.txt' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByText('1 of 2 copies confirmed')).toBeTruthy()
  expect(dialog.getByText(detail)).toBeTruthy()
})

it('highlights the session requirement without deleting or closing details', async () => {
  mocks.hasSession = false
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
  const button = screen.getByRole('button', { name: 'Schedule deletion' })
  expect(button.getAttribute('aria-disabled')).toBe('true')
  expect(button.className).toContain('text-danger')
  fireEvent.click(button)
  const hint = screen.getByRole('alert')
  expect(hint.textContent).toBe('Authorize a browser session in Wallet setup first.')
  expect(hint.className).toContain('animate-session-hint')
  fireEvent.click(button)
  expect(screen.getByRole('alert')).not.toBe(hint)
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(mocks.submit).not.toHaveBeenCalled()
})

it.each(['success', 'reverted'])(
  'keeps a second deletion independent when the first transaction is %s',
  async (status) => {
    const second = {
      ...file,
      id: 'independent',
      fileName: 'independent.txt',
      cid: 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe',
      pieceCid: 'bafkzcibe5hgaodisksofrumva2x5oelxycmmjdbwnfrotfragnpdnlnt74rdvwnjfq',
    }
    setCachedPieces(scope, [file, second])
    mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
    let firstDone!: (receipt: { status: string }) => void
    let secondDone!: (receipt: { status: string }) => void
    mocks.receipt
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            firstDone = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            secondDone = resolve
          })
      )
    render(
      <UploadHistoryProvider>
        <FileBrowser folder="" onFolderChange={vi.fn()} />
      </UploadHistoryProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }))
    await waitFor(() => expect(mocks.receipt).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    fireEvent.click(screen.getByRole('button', { name: 'independent.txt' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
    expect(screen.getByRole('button', { name: 'Schedule deletion' })).toHaveProperty('disabled', false)
    fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }))
    expect(screen.getByRole('button', { name: 'Processing…' })).toHaveProperty('disabled', true)
    await waitFor(() => expect(mocks.receipt).toHaveBeenCalledTimes(2))
    expect(mocks.submit).toHaveBeenCalledTimes(2)
    await act(async () => firstDone({ status }))
    expect(mocks.deleting.mock.calls).toEqual([[true]])
    expect(screen.getByRole('dialog').textContent).toContain('independent.txt')
    expect(screen.queryByText('Deletion transaction reverted for dataset 1. Retry to submit again.')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' })).toHaveProperty(
      'checked',
      true
    )
    await act(async () => secondDone({ status: 'success' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.deleting.mock.calls).toEqual([[true], [false]])
    expect(getCachedPieces(scope)?.find((record) => record.id === second.id)?.deletion?.['1']?.confirmed).toBe(true)
  }
)

it('keeps confirmation timeouts in file details without accumulating global alerts', async () => {
  setCachedPieces(scope, [{ ...file, datasetIds: ['1', '2'] }])
  mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
  mocks.receipt.mockRejectedValue(new WaitForTransactionReceiptTimeoutError({ hash: hash as `0x${string}` }))
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }))
  await screen.findByText('Waiting for deletion confirmation.')
  expect(screen.getAllByRole('link', { name: 'Deletion pending' })).toHaveLength(2)
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
  expect(screen.queryByText('Waiting for deletion confirmation.')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'first.txt' }))
  expect(screen.getByText('Waiting for deletion confirmation.')).toBeTruthy()
  mocks.receipt.mockResolvedValue({ status: 'success' })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue deletion' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(mocks.submit).toHaveBeenCalledTimes(2)
  expect(mocks.receipt).toHaveBeenCalledTimes(4)
})

it.each([
  [{ '1': { transactionHash: hash, confirmed: false } }, ['1'], 'Deletion pending'],
  [
    { '1': { transactionHash: hash, confirmed: true }, '2': { transactionHash: hash, confirmed: false } },
    ['1', '2'],
    'Deletion pending',
  ],
  [{ '1': { transactionHash: hash, confirmed: false } }, ['1', '2'], 'Deletion incomplete'],
  [{ '1': { transactionHash: hash, confirmed: true, remaining: true } }, ['1'], 'Deletion incomplete'],
  [{}, ['1'], 'Deletion incomplete'],
] as const)('distinguishes pending receipts from unfinished deletion work %#', (deletion, datasetIds, status) => {
  expect(fileStatus({ ...file, deletion, datasetIds: [...datasetIds] })).toBe(status)
})

it('keeps manual continuation disabled throughout automatic checking without changing pending status', async () => {
  setCachedPieces(scope, [{ ...file, deletion: { '1': { transactionHash: hash, confirmed: false } } }])
  mocks.autoChecking = new Set([file.pieceCid])
  const view = () => (
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  const { rerender } = render(view())
  fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
  const button = screen.getByRole('button', { name: 'Checking deletion status…' })
  expect(button).toHaveProperty('disabled', true)
  fireEvent.click(button)
  expect(mocks.submit).not.toHaveBeenCalled()
  expect(
    within(screen.getByRole('button', { name: 'first.txt', hidden: true }).closest('tr') as HTMLElement).getByLabelText(
      'Deleting…'
    )
  ).toBeTruthy()
  mocks.autoChecking = new Set()
  rerender(view())
  expect(
    within(screen.getByRole('button', { name: 'first.txt', hidden: true }).closest('tr') as HTMLElement).getByLabelText(
      'Deleting…'
    )
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
  expect(screen.getByRole('button', { name: 'Continue deletion' })).toHaveProperty('disabled', false)
})

it('confirms a batch once and deduplicates identical file records', async () => {
  mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select first.txt' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select second.txt' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete stored files (2)' }))
  const dialog = screen.getByRole('dialog', { name: 'Delete selected files' })
  expect(within(dialog).getByText('2 file records · 1 unique uploads')).toBeTruthy()
  expect(within(dialog).getByRole('list', { name: 'Files affected by deletion' }).children).toHaveLength(2)
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Delete all listed files and their recorded copies.' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete selected files' }))
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2))
  await waitFor(() =>
    expect(getCachedPieces(scope)?.every((file) => file.deletion?.[file.datasetId]?.confirmed)).toBe(true)
  )
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('selects only eligible records in the current file list', async () => {
  setCachedPieces(scope, [
    file,
    { ...file, id: 'elsewhere', folderPath: 'elsewhere', fileName: 'other.txt' },
    {
      ...file,
      id: 'queued',
      fileName: 'queued.txt',
      pieceCid: '',
      upload: { phase: 'waiting', expectedCopies: 2, providers: [], steps: [], checks: 0, nextCheckAt: 0 },
    },
  ])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select all files in this list' }))
  expect(screen.getByText('1 selected')).toBeTruthy()
  expect(screen.getByRole('checkbox', { name: 'Select queued.txt' })).toHaveProperty('disabled', true)
  expect(screen.queryByRole('checkbox', { name: 'Select other.txt' })).toBeNull()
})

it('shows folder activity on every ancestor without marking similarly named folders', async () => {
  const checkpoint = {
    phase: 'uploading' as const,
    expectedCopies: 2,
    providers: [],
    steps: [],
    checks: 0,
    nextCheckAt: 0,
  }
  setCachedPieces(scope, [
    { ...file, id: 'active', folderPath: 'parent/deep', upload: checkpoint },
    { ...file, id: 'idle', folderPath: 'parent-other', upload: undefined },
  ])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  const root = await screen.findByRole('button', { name: 'Files (root)' })
  const parent = within(screen.getByRole('navigation', { name: 'File folders' })).getByRole('button', {
    name: 'parent',
  })
  expect(root.querySelector('[title="Uploads or deletions in progress"]')).not.toBeNull()
  expect(parent.querySelector('[title="Uploads or deletions in progress"]')).not.toBeNull()
  expect(
    screen.getByRole('button', { name: 'deep' }).querySelector('[title="Uploads or deletions in progress"]')
  ).not.toBeNull()
  for (const idle of screen.getAllByRole('button', { name: 'parent-other' }))
    expect(idle.querySelector('[title="Uploads or deletions in progress"]')).toBeNull()
})

it('marks ancestor folders while deletion confirmation is checked and clears activity when checking stops', async () => {
  mocks.autoChecking = new Set([file.pieceCid])
  setCachedPieces(scope, [{ ...file, folderPath: 'deletions/deep' }])
  const view = render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  const nav = within(screen.getByRole('navigation', { name: 'File folders' }))
  await waitFor(() =>
    expect(
      nav.getByRole('button', { name: 'deletions' }).querySelector('[title="Uploads or deletions in progress"]')
    ).not.toBeNull()
  )
  mocks.autoChecking = new Set()
  view.rerender(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  expect(
    nav.getByRole('button', { name: 'deletions' }).querySelector('[title="Uploads or deletions in progress"]')
  ).toBeNull()
})

it('defaults to newest uploads and allows name and size sorting without persisting the selection', async () => {
  setCachedPieces(scope, [
    { ...file, id: 'ten', fileName: 'file10.txt', fileSize: '1 KB', uploadedAt: 4 },
    { ...file, id: 'two', fileName: 'file2.txt', fileSize: '20 Bytes', uploadedAt: 2 },
    { ...file, id: 'one', fileName: 'file1.txt', fileSize: 'Unknown', uploadedAt: 3 },
  ])
  const renderBrowser = () => (
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  const view = render(renderBrowser())
  const names = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getByRole('button', { name: /^file\d+\.txt$/ }).textContent)
  await screen.findByRole('button', { name: 'file1.txt' })
  expect(names()).toEqual(['file10.txt', 'file1.txt', 'file2.txt'])
  expect(screen.getByRole('columnheader', { name: 'Uploaded' }).getAttribute('aria-sort')).toBe('descending')
  fireEvent.click(screen.getByRole('button', { name: 'Name' }))
  expect(names()).toEqual(['file1.txt', 'file2.txt', 'file10.txt'])
  fireEvent.click(screen.getByRole('button', { name: 'Size' }))
  expect(names()).toEqual(['file2.txt', 'file10.txt', 'file1.txt'])
  fireEvent.click(screen.getByRole('button', { name: 'Size' }))
  expect(names()).toEqual(['file10.txt', 'file2.txt', 'file1.txt'])
  expect(screen.getByRole('columnheader', { name: 'Size' }).getAttribute('aria-sort')).toBe('descending')
  view.unmount()
  render(renderBrowser())
  await screen.findByRole('button', { name: 'file1.txt' })
  expect(names()).toEqual(['file10.txt', 'file1.txt', 'file2.txt'])
})

it('does not group uploads with missing piece CIDs and removes only selected safe local records', async () => {
  const failed = {
    ...file,
    id: 'failed',
    fileName: 'failed.txt',
    pieceCid: '',
    cid: '',
    datasetId: '',
    datasetIds: [],
    copyCount: 0,
    upload: { phase: 'failed', expectedCopies: 2, providers: [], steps: [], checks: 0, nextCheckAt: 0 },
  } satisfies DatasetPiece
  setCachedPieces(scope, [
    failed,
    { ...failed, id: 'interrupted', fileName: 'interrupted.txt', upload: { ...failed.upload, phase: 'interrupted' } },
    { ...failed, id: 'waiting', fileName: 'waiting.txt', upload: { ...failed.upload, phase: 'waiting' } },
    {
      ...failed,
      id: 'pending',
      fileName: 'pending.txt',
      upload: { ...failed.upload, providers: [{ providerId: '1', serviceURL: '', transactionHash: hash }] },
    },
    file,
  ])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByText('failed.txt'))
  expect(screen.queryByText('These files contain identical content. Deletion affects all listed records:')).toBeNull()
  expect(screen.queryByText('Delete from Filecoin')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
  expect(screen.getByRole('checkbox', { name: 'Select pending.txt' })).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select failed.txt' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select interrupted.txt' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select waiting.txt' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select first.txt' }))
  expect(screen.getByRole('button', { name: 'Delete stored files (1)' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remove local records (3)' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove local records' }))
  await waitFor(() =>
    expect(
      getCachedPieces(scope)
        ?.map((record) => record.id)
        .sort()
    ).toEqual(['first', 'pending'])
  )
  expect(mocks.submit).not.toHaveBeenCalled()
})

it('shows funding as a static Paused badge and allows selecting and removing its local record', async () => {
  setCachedPieces(scope, [
    {
      ...file,
      datasetId: '',
      datasetIds: [],
      pieceCid: '',
      cid: '',
      copyCount: 0,
      upload: {
        phase: 'funding',
        expectedCopies: 2,
        providers: [],
        steps: [],
        checks: 0,
        nextCheckAt: 0,
        funding: { depositNeeded: '645192894000747211', needsApproval: false },
      },
    },
  ])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  const row = (await screen.findByRole('button', { name: 'first.txt' })).closest('tr') as HTMLElement
  expect(within(row).getByText('Paused')).toBeTruthy()
  expect(within(row).queryByLabelText('Uploading…')).toBeNull()
  expect(screen.queryByRole('columnheader', { name: /Status|Copies/ })).toBeNull()
  fireEvent.click(within(row).getByRole('checkbox', { name: 'Select first.txt' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove local records (1)' }))
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Remove local records' })).getByRole('button', {
      name: 'Remove local records',
    })
  )
  await waitFor(() => expect(getCachedPieces(scope)).toEqual([]))
})

it('keeps chain confirmation separate from indexing and interrupted upload progress', () => {
  const upload: NonNullable<DatasetPiece['upload']> = {
    phase: 'interrupted',
    expectedCopies: 2,
    providers: [],
    steps: [],
    checks: 0,
    nextCheckAt: 0,
  }
  expect(customerStatus({ ...file, copyCount: 1, ipfsIndexed: false, upload })).toBe('Stored')
  expect(customerStatus({ ...file, copyCount: 0, ipfsIndexed: true, upload })).toBe('Upload failed')
  expect(customerStatus({ ...file, copyCount: 0, ipfsIndexed: true, upload: { ...upload, phase: 'pending' } })).toBe(
    'Uploading…'
  )
  expect(
    customerStatus({
      ...file,
      copyCount: 0,
      upload: { ...upload, providers: [{ providerId: '4', serviceURL: 'https://sp.example', transactionHash: hash }] },
    })
  ).toBe('Uploading…')
  expect(customerStatus({ ...file, copyCount: 0, upload: { ...upload, phase: 'funding' } })).toBe('Paused')
  expect(fileStatus({ ...file, copyCount: 0, upload: { ...upload, phase: 'funding' } })).toBe('Waiting for funding')
})

it.each(['waiting', 'uploading', 'confirming', 'pending'] as const)(
  'distinguishes queued records from uploads in progress (%s)',
  async (phase) => {
    setCachedPieces(scope, [
      {
        ...file,
        datasetId: '',
        datasetIds: [],
        pieceCid: '',
        cid: '',
        copyCount: 0,
        upload: { phase, expectedCopies: 2, providers: [], steps: [], checks: 0, nextCheckAt: 0 },
      },
    ])
    render(
      <UploadHistoryProvider>
        <FileBrowser folder="" onFolderChange={vi.fn()} />
      </UploadHistoryProvider>
    )
    const row = (await screen.findByRole('button', { name: 'first.txt' })).closest('tr') as HTMLElement
    const selection = within(row).getByRole('checkbox', { name: 'Select first.txt' })
    if (phase === 'waiting') {
      expect(within(row).getByRole('img', { name: 'Waiting to upload' }).getAttribute('title')).toBe(
        'Waiting to upload'
      )
      expect(within(row).queryByText('Waiting')).toBeNull()
      expect(within(row).queryByLabelText('Uploading…')).toBeNull()
      expect(selection).toHaveProperty('disabled', false)
      expect(screen.queryAllByTitle('Uploads or deletions in progress')).toHaveLength(0)
    } else {
      expect(within(row).queryByText('Waiting')).toBeNull()
      expect(within(row).getByLabelText('Uploading…')).toBeTruthy()
      expect(selection).toHaveProperty('disabled', true)
    }
  }
)

it('keeps a deletion-pending row unselectable while its deletion spinner is shown', async () => {
  setCachedPieces(scope, [{ ...file, deletion: { '1': { transactionHash: hash, confirmed: false } } }])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  const row = (await screen.findByRole('button', { name: 'first.txt' })).closest('tr') as HTMLElement
  expect(within(row).getByLabelText('Deleting…')).toBeTruthy()
  expect(within(row).getByRole('checkbox', { name: 'Select first.txt' })).toHaveProperty('disabled', true)
})

it.each(['table', 'details'] as const)(
  'deletes a confirmed partial upload after refresh stopped its remaining copy (%s)',
  async (entry) => {
    const partial: DatasetPiece = {
      ...file,
      copyCount: 1,
      upload: {
        phase: 'interrupted',
        expectedCopies: 2,
        steps: [],
        checks: 20,
        nextCheckAt: 0,
        providers: [
          { providerId: '1', serviceURL: 'https://first.example', dataSetId: '1', pieceId: '1', confirmed: true },
          { providerId: '32', serviceURL: 'https://second.example' },
        ],
      },
    }
    setCachedPieces(scope, [partial])
    mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
    render(
      <UploadHistoryProvider>
        <FileBrowser folder="" onFolderChange={vi.fn()} />
      </UploadHistoryProvider>
    )
    const name = await screen.findByRole('button', { name: 'first.txt' })
    expect(screen.getByRole('checkbox', { name: 'Select first.txt' })).toHaveProperty('disabled', false)
    if (entry === 'details') {
      fireEvent.click(name)
      expect(screen.getByText(/Your confirmed copies remain stored/)).toBeTruthy()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Delete all recorded copies of this content.' }))
      const deletion = screen.getByRole('button', { name: 'Schedule deletion' })
      expect(deletion).toHaveProperty('disabled', false)
      fireEvent.click(deletion)
    } else {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select first.txt' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete stored files (1)' }))
      const dialog = within(screen.getByRole('dialog'))
      fireEvent.click(dialog.getByRole('checkbox'))
      fireEvent.click(dialog.getByRole('button', { name: 'Delete selected files' }))
    }
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
    await waitFor(() => expect(getCachedPieces(scope)?.[0].deletion?.['1'].confirmed).toBe(true))
  }
)

it.each(['transaction', 'stored', 'active'] as const)(
  'keeps deletion blocked for an uncertain or active secondary upload (%s)',
  async (kind) => {
    setCachedPieces(scope, [
      {
        ...file,
        copyCount: 1,
        upload: {
          phase: kind === 'active' ? 'confirming' : 'interrupted',
          expectedCopies: 2,
          providers: [
            { providerId: '1', serviceURL: '', confirmed: true, dataSetId: '1', pieceId: '1' },
            {
              providerId: '32',
              serviceURL: '',
              ...(kind === 'transaction' ? { transactionHash: hash } : kind === 'stored' ? { stored: true } : {}),
            },
          ],
          steps: [],
          checks: 0,
          nextCheckAt: 0,
        },
      },
    ])
    render(
      <UploadHistoryProvider>
        <FileBrowser folder="" onFolderChange={vi.fn()} />
      </UploadHistoryProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
    expect(screen.getByRole('button', { name: 'Schedule deletion' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('checkbox', { name: 'Select first.txt', hidden: true })).toHaveProperty('disabled', true)
    expect(mocks.submit).not.toHaveBeenCalled()
  }
)

it.each([
  { primary: hash, hashes: ['', ''], expected: [hash, null] },
  { primary: hash, hashes: ['', `0x${'b'.repeat(64)}`], expected: [hash, `0x${'b'.repeat(64)}`] },
  { primary: '', hashes: ['', `0x${'b'.repeat(64)}`], expected: [null, `0x${'b'.repeat(64)}`] },
])('only links the transaction actually recorded for each dataset (%j)', async ({ primary, hashes, expected }) => {
  setCachedPieces(scope, [
    {
      ...file,
      datasetIds: ['1', '2'],
      providerIds: ['1', '5'],
      copyCount: 2,
      transactionHash: primary,
      transactionHashes: hashes,
    },
  ])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
  const storage = within(screen.getByRole('heading', { name: 'Storage copies' }).parentElement as HTMLElement)
  for (const [index, id] of ['1', '2'].entries()) {
    const card = within(
      storage.getByRole('link', { name: `Dataset ${id}` }).parentElement?.parentElement as HTMLElement
    )
    const link = card.queryByRole('link', { name: 'Upload transaction' })
    if (expected[index])
      expect(link?.getAttribute('href')).toBe(`https://filecoin.blockscout.com/tx/${expected[index]}`)
    else expect(link).toBeNull()
  }
  expect(screen.queryAllByRole('link').some((link) => link.getAttribute('href')?.endsWith('/tx/'))).toBe(false)
})

it('uses a matching confirmed provider receipt when its per-copy transaction cache is empty', async () => {
  setCachedPieces(scope, [
    {
      ...file,
      copyCount: 1,
      transactionHashes: [''],
      upload: {
        phase: 'complete',
        expectedCopies: 1,
        steps: [],
        checks: 0,
        nextCheckAt: 0,
        providers: [{ providerId: '1', serviceURL: '', dataSetId: '1', confirmed: true, transactionHash: hash }],
      },
    },
  ])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
  expect(screen.getByRole('link', { name: 'Upload transaction' }).getAttribute('href')).toBe(
    `https://filecoin.blockscout.com/tx/${hash}`
  )
})

it('does not assign a pending providers hash to a different API-recovered dataset', async () => {
  const { mergeIndexedFiles } = await import('../../lib/filecoin-pin/drive-api.ts')
  const pending: DatasetPiece = {
    ...file,
    datasetId: '',
    datasetIds: [],
    pieceId: undefined,
    copyCount: 0,
    transactionHash: hash,
    transactionHashes: [],
    upload: {
      phase: 'pending',
      expectedCopies: 2,
      steps: [],
      checks: 0,
      nextCheckAt: 0,
      providers: [
        { providerId: '1', serviceURL: '', transactionHash: hash, stored: true },
        { providerId: '5', serviceURL: '' },
      ],
    },
  }
  const recovered: DatasetPiece = {
    ...file,
    id: 'indexed-2-1',
    datasetId: '2',
    datasetIds: ['2'],
    providerId: '5',
    uploadedAt: 2,
    transactionHash: '',
  }
  const merged = mergeIndexedFiles([pending], [recovered])
  expect(merged).toHaveLength(1)
  setCachedPieces(scope, merged)
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
  const storage = within(screen.getByRole('heading', { name: 'Storage copies' }).parentElement as HTMLElement)
  expect(storage.getByRole('link', { name: 'Dataset 2' })).toBeTruthy()
  expect(storage.queryByRole('link', { name: 'Upload transaction' })).toBeNull()
})

it('permits deleting stored content despite a failed rejected alias with no copies', async () => {
  setCachedPieces(scope, [
    { ...file, copyCount: 1 },
    {
      ...file,
      id: 'old-failed',
      fileName: 'failed.txt',
      datasetId: '',
      datasetIds: [],
      copyCount: 0,
      upload: {
        phase: 'failed',
        expectedCopies: 2,
        steps: [],
        checks: 0,
        nextCheckAt: 0,
        providers: [{ providerId: '1', serviceURL: '', transactionHash: hash, stored: true, rejected: true }],
      },
    },
  ])
  mocks.context.mockResolvedValue({ deletePieces: mocks.submit, getScheduledRemovals: async () => [] })
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  await screen.findByRole('button', { name: 'first.txt' })
  expect(screen.getByRole('checkbox', { name: 'Select first.txt' })).toHaveProperty('disabled', false)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all files in this list' }))
  expect(screen.getByRole('button', { name: 'Remove local records (1)' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Delete stored files (1)' }))
  const dialog = within(screen.getByRole('dialog', { name: 'Delete selected files' }))
  expect(dialog.queryByText('failed.txt')).toBeNull()
  fireEvent.click(dialog.getByRole('checkbox'))
  fireEvent.click(dialog.getByRole('button', { name: 'Delete selected files' }))
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
  await waitFor(() =>
    expect(getCachedPieces(scope)?.find((record) => record.id === file.id)?.deletion?.['1'].confirmed).toBe(true)
  )
  expect(getCachedPieces(scope)?.find((record) => record.id === 'old-failed')?.deletion).toBeUndefined()
})
