import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { UploadHistoryProvider } from '../../context/upload-history-context.tsx'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { parseDirectoryBackup, readFolders, saveFolders } from '../../lib/local-storage/drive-directory.ts'
import {
  addCachedPiece,
  getCachedPieces,
  mutateCachedPieces,
  setCachedPieces,
} from '../../lib/local-storage/piece-cache.ts'
import { FileBrowser, fileStatus } from './file-browser.tsx'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  receipt: vi.fn(),
  permissions: vi.fn(),
  uploading: vi.fn(),
  submit: vi.fn(),
  download: vi.fn(),
  uploadInProgress: false,
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
    uploading: mocks.uploadInProgress,
    setUploading: mocks.uploading,
  }),
}))
vi.mock('../../lib/filecoin-pin/browser-wallet.ts', () => ({
  publicClient: () => ({ waitForTransactionReceipt: mocks.receipt }),
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
  expect(screen.getByText('Deletion incomplete', { exact: true })).toBeTruthy()
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
  expect(screen.getByRole('status').textContent).toContain('Removed from the file list')
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

it('distinguishes pending indexing from stopped checks without treating storage as failed', () => {
  expect(fileStatus({ ...file, ipfsIndexed: false, ipfsCheckAttempts: 4 })).toBe('Stored · IPFS indexing pending')
  expect(fileStatus({ ...file, ipfsIndexed: false, ipfsCheckAttempts: 5 })).toBe('Stored · IPFS indexing unconfirmed')
  expect(fileStatus({ ...file, ipfsIndexed: true, ipfsCheckAttempts: 5 })).toBe('Stored')
  expect(fileStatus({ ...file, cid: '', ipfsIndexed: false })).toBe('Metadata missing')
  expect(
    fileStatus({ ...file, ipfsIndexed: false, deletion: { '1': { confirmed: true, transactionHash: hash } } })
  ).toBe('Deletion scheduled')
})

it('keeps removed files hidden after restore and reload, but shows a new identical upload', async () => {
  const archived = { ...file, folderPath: 'old/nested', deletion: { '1': { confirmed: true, transactionHash: hash } } }
  const backup = JSON.stringify({ version: 1, scope, files: [archived], folders: [] })
  const restored = parseDirectoryBackup(backup, scope, 'mainnet')
  expect(restored.folders).toEqual([])
  setCachedPieces(scope, restored.files)
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
  expect(screen.getByRole('heading', { name: 'Files 0' })).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search all files' }), { target: { value: 'first' } })
  expect(screen.getByText('No matching files.')).toBeTruthy()
  expect(getCachedPieces(scope)?.[0].deletion).toEqual(archived.deletion)
  view.unmount()
  await addCachedPiece(scope, { ...file, id: 'new-upload', fileName: 'new.txt', uploadedAt: 2 })
  mount()
  expect(await screen.findByRole('button', { name: 'new.txt' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'first.txt' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'Files 1' })).toBeTruthy()
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
    await screen.findByText(
      'Removed from the file list. Storage providers will process removal in a subsequent proving period.'
    )
    expect(mocks.receipt).toHaveBeenCalledWith({ hash })
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

it('saves only edited form fields when another tab moves the file while its details are open', async () => {
  setCachedPieces(scope, [file])
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'first.txt' }))
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'renamed.txt' } })
  await act(async () => {
    await mutateCachedPieces(scope, (current) =>
      current.map((file) => ({ ...file, folderPath: 'reports', ipfsIndexed: true }))
    )
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save directory changes' }))
  await waitFor(() =>
    expect(getCachedPieces(scope)?.[0]).toMatchObject({
      fileName: 'renamed.txt',
      folderPath: 'reports',
      ipfsIndexed: true,
    })
  )
  expect(screen.getByRole('combobox', { name: 'File folder' })).toHaveProperty('value', 'reports')
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
  await within(dialogB).findByText(/being uploaded or deleted in another tab/)
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

it('confirms empty-folder removal, returns to its parent and never submits a chain transaction', async () => {
  await saveFolders(scope, ['reports/empty'])
  const navigate = vi.fn()
  render(
    <UploadHistoryProvider>
      <FileBrowser folder="reports/empty" onFolderChange={navigate} />
    </UploadHistoryProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Delete folder' }))
  const dialog = screen.getByRole('dialog', { name: 'Delete folder?' })
  expect(within(dialog).getByText(/No files will be deleted from Filecoin/)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete folder' }))
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('reports'))
  expect(readFolders(scope)).toEqual(['reports'])
  expect(mocks.submit).not.toHaveBeenCalled()
  expect(mocks.permissions).not.toHaveBeenCalled()
})

it('explains why a nonempty folder cannot be deleted and does not offer root deletion', async () => {
  await saveFolders(scope, ['reports/child'])
  const view = render(
    <UploadHistoryProvider>
      <FileBrowser folder="reports" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Delete folder' }))
  const dialog = screen.getByRole('dialog', { name: 'Delete folder?' })
  expect(within(dialog).getByText(/not empty/)).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Delete folder' })).toHaveProperty('disabled', true)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  view.rerender(
    <UploadHistoryProvider>
      <FileBrowser folder="" onFolderChange={vi.fn()} />
    </UploadHistoryProvider>
  )
  expect(screen.queryByRole('button', { name: 'Delete folder' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Files (root)' }).getAttribute('aria-current')).toBe('page')
})
