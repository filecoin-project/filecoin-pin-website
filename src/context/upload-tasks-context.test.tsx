import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pending: null as object | null,
  prepare: vi.fn(),
  execute: vi.fn(),
  setUploading: vi.fn(),
  refresh: vi.fn(),
  removalError: vi.fn(),
}))
vi.mock('../lib/filecoin-pin/drive-api.ts', async (original) => ({
  ...(await original<object>()),
  loadDriveFiles: vi.fn().mockResolvedValue([]),
}))
vi.mock('../lib/filecoin-pin/storage-chain.ts', () => ({ assertCurrentStorageChain: vi.fn() }))
vi.mock('filecoin-pin/core/payments', () => ({
  checkFILBalance: vi.fn().mockResolvedValue({ balance: 10n ** 18n, isCalibnet: false }),
  validateGasRequirement: vi.fn().mockReturnValue({ isValid: true }),
}))
vi.mock('filecoin-pin/core/upload', () => ({
  executeUpload: mocks.execute,
  checkUploadReadiness: vi.fn().mockResolvedValue({ status: 'ready' }),
}))
vi.mock('../lib/filecoin-pin/upload-input.ts', () => ({
  prepareUploadInput: async (file: File) => ({
    rootCid: {
      toString: () =>
        file.name === 'first.txt'
          ? 'bafkreigh2akiscaildcgck5x5wqlooqkztdxqv5t5uwmybnv5brkw4zj3m'
          : 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe',
    },
    carBytes: new Uint8Array([1]),
  }),
}))
vi.mock('../lib/filecoin-pin/fresh-contexts.ts', () => ({
  createFreshUploadContexts: async () =>
    [4n, 5n].map((id) => ({
      provider: { id, name: `SP ${id}`, pdp: { serviceURL: `https://sp${id}.example` } },
      dataSetId: id + 10n,
    })),
}))
vi.mock('../hooks/use-filecoin-pin-context.ts', () => ({ useFilecoinPinContext: () => context }))
vi.mock('./browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({
    address: scope.slice(4),
    network: 'mainnet',
    pendingTransaction: mocks.pending,
    setUploading: mocks.setUploading,
  }),
}))

import { acquireContentLock } from '../lib/filecoin-pin/content-lock.ts'
import { getCachedPieces, setCachedPieces } from '../lib/local-storage/piece-cache.ts'
import { UploadHistoryProvider, useUploadHistory } from './upload-history-context.tsx'
import { UploadTasksProvider, useUploadTasks } from './upload-tasks-context.tsx'

const scope = '314:0x1111111111111111111111111111111111111111'
const context = {
  storageScope: scope,
  wallet: { status: 'ready', data: { address: scope.slice(4), network: 'mainnet' } },
  synapse: { storage: { prepare: mocks.prepare } },
  refreshWallet: mocks.refresh,
  ensurePermissions: async () => undefined,
  addDataSetId: vi.fn(),
  debugParams: { providerId: null, dataSetId: null },
}
const pieceCid = 'bafkzcibcd4bdomn3tgwgrh3g532zopskstnbrd2n3sxfqbze7rxt7vqn7veigmy'
type Operation = {
  progress: (event: unknown) => void
  resolve: (value: unknown) => void
  reject: (cause: Error) => void
}
let operations: Operation[]
function Harness() {
  const tasks = useUploadTasks()
  if (!tasks) throw new Error('UploadTasksProvider is required')
  const { history, mutateHistory } = useUploadHistory()
  return (
    <>
      <button onClick={() => void tasks.start(new File(['first'], 'first.txt'), 'one')} type="button">
        First
      </button>
      <button onClick={() => void tasks.start(new File(['second'], 'second.txt'), 'two')} type="button">
        Second
      </button>
      <button
        onClick={() =>
          void tasks.startMany([new File(['first'], 'first.txt'), new File(['second'], 'second.txt')], 'batch')
        }
        type="button"
      >
        Batch
      </button>
      {history
        .filter((file) => file.upload?.phase === 'funding')
        .map((file) => (
          <button key={file.id} onClick={() => void tasks.resume(file.id)} type="button">
            Continue funded upload
          </button>
        ))}
      {[...tasks.queuedIds].map((id) => (
        <button key={id} onClick={() => void tasks.cancelQueued(id)} type="button">
          Cancel queued upload
        </button>
      ))}
      <button
        onClick={() =>
          void tasks.startMany([new File(['ok'], 'valid.txt'), new File(['bad'], `${'中'.repeat(33)}.txt`)], '')
        }
        type="button"
      >
        Invalid batch
      </button>
      <button
        onClick={() => void mutateHistory((current) => current.filter((file) => file.upload?.phase !== 'funding'))}
        type="button"
      >
        Remove paused record externally
      </button>
      <button
        onClick={() =>
          void tasks
            .removeMany(
              history
                .filter((file) => file.upload?.phase === 'waiting' || file.upload?.phase === 'funding')
                .map((file) => file.id)
            )
            .catch(mocks.removalError)
        }
        type="button"
      >
        Remove pending batch
      </button>
      <button
        onClick={() => void tasks.removeMany(history.map((file) => file.id)).catch(mocks.removalError)}
        type="button"
      >
        Remove all records
      </button>
      <output>{history.map((file) => `${file.fileName}:${file.upload?.phase}:${file.copyCount}`).join('|')}</output>
    </>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.pending = null
  localStorage.clear()
  setCachedPieces(scope, [])
  mocks.prepare.mockResolvedValue({ costs: { ready: true } })
  operations = []
  mocks.execute.mockImplementation(
    (_synapse, _bytes, _root, options) =>
      new Promise((resolve, reject) => operations.push({ progress: options.onProgress, resolve, reject }))
  )
})
it('persists parked files, allows the next transfer and isolates each task when an earlier confirmation times out', async () => {
  render(
    <UploadHistoryProvider>
      <UploadTasksProvider>
        <Harness />
      </UploadTasksProvider>
    </UploadHistoryProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'First' }))
  await waitFor(() => expect(operations).toHaveLength(1))
  expect(screen.getByRole('button', { name: 'Second' })).toHaveProperty('disabled', false)
  await act(async () =>
    operations[0].progress({ type: 'stored', data: { providerId: 4n, pieceCid: { toString: () => pieceCid } } })
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Second' })).toHaveProperty('disabled', false))
  expect(getCachedPieces(scope)?.find((file) => file.fileName === 'first.txt')?.upload?.phase).toBe('confirming')
  expect(getCachedPieces(scope)?.find((file) => file.fileName === 'first.txt')?.datasetIds).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: 'Second' }))
  await waitFor(() => expect(operations).toHaveLength(2))
  await act(async () => {
    operations[0].progress({ type: 'piecesAdded', data: { providerId: 4n, txHash: '0xfirst' } })
    operations[0].reject(new Error('Provider confirmation timed out'))
    operations[1].progress({ type: 'stored', data: { providerId: 4n, pieceCid: { toString: () => pieceCid } } })
    operations[1].progress({ type: 'piecesAdded', data: { providerId: 4n, txHash: '0xsecond' } })
    operations[1].progress({ type: 'piecesConfirmed', data: { providerId: 4n, dataSetId: 14n, pieceIds: [2n] } })
    operations[1].progress({ type: 'piecesConfirmed', data: { providerId: 5n, dataSetId: 15n, pieceIds: [3n] } })
    operations[1].resolve({
      copies: [
        { role: 'primary', providerId: 4n, dataSetId: 14n, pieceId: 2n },
        { role: 'secondary', providerId: 5n, dataSetId: 15n, pieceId: 3n },
      ],
      requestedCopies: 2,
    })
  })
  await waitFor(() => {
    const files = getCachedPieces(scope) ?? []
    expect(files.find((file) => file.fileName === 'first.txt')?.upload?.phase).toBe('pending')
    expect(files.find((file) => file.fileName === 'second.txt')?.upload?.phase).toBe('complete')
  })
  const files = getCachedPieces(scope) ?? []
  expect(files.find((file) => file.fileName === 'first.txt')?.upload?.providers[0].transactionHash).toBe('0xfirst')
  expect(files.find((file) => file.fileName === 'second.txt')?.transactionHash).toBe('0xsecond')
  expect(files.find((file) => file.fileName === 'first.txt')?.folderPath).toBe('one')
  expect(files.find((file) => file.fileName === 'second.txt')?.folderPath).toBe('two')
  await waitFor(() => expect(mocks.setUploading).toHaveBeenLastCalledWith(false))
})

it('queues a multi-file selection and starts the next file while earlier confirmations continue', async () => {
  render(
    <UploadHistoryProvider>
      <UploadTasksProvider>
        <Harness />
      </UploadTasksProvider>
    </UploadHistoryProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Batch' }))
  await waitFor(() => expect(operations).toHaveLength(1))
  expect(getCachedPieces(scope)?.find((file) => file.fileName === 'second.txt')?.upload?.phase).toBe('waiting')
  expect(getCachedPieces(scope)?.every((file) => file.folderPath === 'batch')).toBe(true)
  await act(async () =>
    operations[0].progress({ type: 'stored', data: { providerId: 4n, pieceCid: { toString: () => pieceCid } } })
  )
  await waitFor(() => expect(operations).toHaveLength(2))
  expect(getCachedPieces(scope)?.find((file) => file.fileName === 'first.txt')?.upload?.phase).toBe('confirming')
  await act(async () => {
    for (const operation of operations) operation.reject(new Error('Stopped test fixture'))
  })
  await waitFor(() => expect(mocks.setUploading).toHaveBeenLastCalledWith(false))
})

it('cancels only waiting uploads and frees their local records without starting them', async () => {
  render(
    <UploadHistoryProvider>
      <UploadTasksProvider>
        <Harness />
      </UploadTasksProvider>
    </UploadHistoryProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Batch' }))
  await waitFor(() => expect(operations).toHaveLength(1))
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel queued upload' }))
  await waitFor(() => expect(getCachedPieces(scope)).toHaveLength(1))
  expect(getCachedPieces(scope)?.[0].fileName).toBe('first.txt')
  expect(operations).toHaveLength(1)
  expect(mocks.setUploading).not.toHaveBeenLastCalledWith(false)
  await act(async () => operations[0].reject(new Error('Stopped test fixture')))
  await waitFor(() => expect(mocks.setUploading).toHaveBeenLastCalledWith(false))
})

it('advances the queue after a file fails before reaching a provider', async () => {
  mocks.execute.mockRejectedValueOnce(new Error('First transfer failed'))
  render(
    <UploadHistoryProvider>
      <UploadTasksProvider>
        <Harness />
      </UploadTasksProvider>
    </UploadHistoryProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Batch' }))
  await waitFor(() => expect(operations).toHaveLength(1))
  expect(getCachedPieces(scope)?.find((file) => file.fileName === 'first.txt')?.upload?.phase).toBe('failed')
  expect(getCachedPieces(scope)?.find((file) => file.fileName === 'second.txt')?.upload?.phase).toBe('uploading')
  await act(async () => operations[0].reject(new Error('Stopped test fixture')))
  await waitFor(() => expect(mocks.setUploading).toHaveBeenLastCalledWith(false))
})

it('rejects a batch with an overlong UTF-8 file name before creating records or starting transfers', async () => {
  render(
    <UploadHistoryProvider>
      <UploadTasksProvider>
        <Harness />
      </UploadTasksProvider>
    </UploadHistoryProvider>
  )
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Invalid batch' })))
  expect(getCachedPieces(scope)).toEqual([])
  expect(mocks.execute).not.toHaveBeenCalled()
  expect(mocks.setUploading).toHaveBeenLastCalledWith(false)
})

it('pauses the queue for funding, releases the wallet, and resumes using retained file bytes', async () => {
  mocks.prepare.mockResolvedValueOnce({
    costs: { ready: false, depositNeeded: 645192894000747211n, needsFwssMaxApproval: false },
  })
  render(
    <UploadHistoryProvider>
      <UploadTasksProvider>
        <Harness />
      </UploadTasksProvider>
    </UploadHistoryProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Batch' }))
  await screen.findByRole('button', { name: 'Continue funded upload' })
  expect(operations).toHaveLength(0)
  expect(mocks.prepare).toHaveBeenCalledTimes(1)
  expect(getCachedPieces(scope)?.find((file) => file.fileName === 'first.txt')?.upload).toMatchObject({
    phase: 'funding',
    funding: { depositNeeded: '645192894000747211' },
  })
  await waitFor(() => expect(mocks.setUploading).toHaveBeenLastCalledWith(false))
  fireEvent.click(screen.getByRole('button', { name: 'Continue funded upload' }))
  await waitFor(() => expect(operations).toHaveLength(1))
  expect(mocks.prepare).toHaveBeenCalledTimes(2)
})

it('keeps funding available when validation of a new batch fails while the queue is paused', async () => {
  mocks.prepare.mockResolvedValueOnce({ costs: { ready: false, depositNeeded: 1n, needsFwssMaxApproval: false } })
  render(
    <UploadHistoryProvider>
      <UploadTasksProvider>
        <Harness />
      </UploadTasksProvider>
    </UploadHistoryProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Batch' }))
  await screen.findByRole('button', { name: 'Continue funded upload' })
  await waitFor(() => expect(mocks.setUploading).toHaveBeenLastCalledWith(false))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Invalid batch' })))
  expect(mocks.setUploading).toHaveBeenLastCalledWith(false)
  expect(operations).toHaveLength(0)
  expect(getCachedPieces(scope)).toHaveLength(2)
})

it('releases the queue when another directory update removes a paused upload', async () => {
  mocks.prepare.mockResolvedValueOnce({ costs: { ready: false, depositNeeded: 1n, needsFwssMaxApproval: false } })
  render(
    <UploadHistoryProvider>
      <UploadTasksProvider>
        <Harness />
      </UploadTasksProvider>
    </UploadHistoryProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Batch' }))
  await screen.findByRole('button', { name: 'Continue funded upload' })
  expect(operations).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Remove paused record externally' }))
  await waitFor(() => expect(operations).toHaveLength(1))
  expect(getCachedPieces(scope)?.some((file) => file.fileName === 'first.txt')).toBe(false)
  expect(getCachedPieces(scope)?.find((file) => file.fileName === 'second.txt')?.upload?.phase).toBe('uploading')
})

it('removes a funding-blocked batch atomically without starting the queued file', async () => {
  mocks.prepare.mockResolvedValueOnce({ costs: { ready: false, depositNeeded: 1n, needsFwssMaxApproval: false } })
  render(
    <UploadHistoryProvider>
      <UploadTasksProvider>
        <Harness />
      </UploadTasksProvider>
    </UploadHistoryProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Batch' }))
  await screen.findByRole('button', { name: 'Continue funded upload' })
  fireEvent.click(screen.getByRole('button', { name: 'Remove pending batch' }))
  await waitFor(() => expect(getCachedPieces(scope)).toEqual([]))
  expect(mocks.prepare).toHaveBeenCalledTimes(1)
  expect(operations).toHaveLength(0)
  await waitFor(() => expect(mocks.setUploading).toHaveBeenLastCalledWith(false))
  fireEvent.click(screen.getByRole('button', { name: 'First' }))
  await waitFor(() => expect(operations).toHaveLength(1))
})

it('rejects bulk removal of a transfer that has started', async () => {
  render(
    <UploadHistoryProvider>
      <UploadTasksProvider>
        <Harness />
      </UploadTasksProvider>
    </UploadHistoryProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Batch' }))
  await waitFor(() => expect(operations).toHaveLength(1))
  fireEvent.click(screen.getByRole('button', { name: 'Remove all records' }))
  await waitFor(() => expect(mocks.removalError).toHaveBeenCalled())
  expect(getCachedPieces(scope)).toHaveLength(2)
  expect(operations).toHaveLength(1)
})

it('blocks starting uploads while an owner transaction is awaiting confirmation', async () => {
  mocks.pending = { hash: '0xpending' }
  render(
    <UploadHistoryProvider>
      <UploadTasksProvider>
        <Harness />
      </UploadTasksProvider>
    </UploadHistoryProvider>
  )
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'First' })))
  expect(getCachedPieces(scope)).toEqual([])
  expect(mocks.prepare).not.toHaveBeenCalled()
  expect(operations).toHaveLength(0)
})

it('does not resume a paused record while another tab holds its task lock', async () => {
  mocks.prepare.mockResolvedValueOnce({ costs: { ready: false, depositNeeded: 1n, needsFwssMaxApproval: false } })
  render(
    <UploadHistoryProvider>
      <UploadTasksProvider>
        <Harness />
      </UploadTasksProvider>
    </UploadHistoryProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Batch' }))
  await screen.findByRole('button', { name: 'Continue funded upload' })
  await waitFor(() => expect(mocks.setUploading).toHaveBeenLastCalledWith(false))
  const paused = getCachedPieces(scope)?.find((file) => file.upload?.phase === 'funding')
  if (!paused) throw new Error('Missing funding record')
  const release = await acquireContentLock(`${scope}:upload-task`, paused.id)
  try {
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue funded upload' })))
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    expect(operations).toHaveLength(0)
    expect(getCachedPieces(scope)?.find((file) => file.id === paused.id)?.upload?.phase).toBe('funding')
  } finally {
    await release()
  }
  fireEvent.click(screen.getByRole('button', { name: 'Continue funded upload' }))
  await waitFor(() => expect(operations).toHaveLength(1))
})
