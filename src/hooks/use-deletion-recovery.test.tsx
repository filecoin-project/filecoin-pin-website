import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), submit: vi.fn(), scope: '314:0xabc' as string | null }))
vi.mock('../lib/filecoin-pin/transaction-receipt.ts', () => ({ resolveTransactionReceipt: mocks.resolve }))
vi.mock('../lib/filecoin-pin/delete.ts', async (original) => ({
  ...(await original<object>()),
  scheduleFileDeletion: mocks.submit,
}))
vi.mock('./use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({ synapse: null, storageScope: mocks.scope }),
}))
vi.mock('../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({ address: '0xabc', network: 'mainnet', session: null }),
}))

import { UploadHistoryProvider } from '../context/upload-history-context.tsx'
import { acquireContentLock } from '../lib/filecoin-pin/content-lock.ts'
import { getCachedPieces, setCachedPieces } from '../lib/local-storage/piece-cache.ts'
import type { DatasetPiece } from './use-dataset-pieces.ts'
import { useDeletionRecovery } from './use-deletion-recovery.ts'

const scope = '314:0xabc'
const hash = `0x${'a'.repeat(64)}` as const
const replacementHash = `0x${'b'.repeat(64)}` as const
const messageCid = 'bafy2bzacebhdmbh4f7uviyalf3dsrwwonqaqwnomzkdxxtsik74ukjgtenjco'
const file = {
  id: 'one',
  fileName: 'one.txt',
  fileSize: '1 B',
  cid: 'root',
  pieceCid: 'piece',
  datasetId: '1',
  datasetIds: ['1'],
  providerId: '4',
  providerName: 'SP',
  serviceURL: '',
  transactionHash: '',
  network: 'mainnet',
  uploadedAt: 1,
  deletion: { '1': { transactionHash: hash, confirmed: false } },
} satisfies DatasetPiece
const onFailure = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  mocks.scope = scope
  mocks.resolve.mockResolvedValue({ status: 'pending' })
  setCachedPieces(scope, [structuredClone(file)])
})
afterEach(() => {
  vi.useRealTimers()
})

it('recovers saved confirmations on mount without a session or submitting deletion', async () => {
  mocks.resolve.mockResolvedValue({ status: 'success', hash: replacementHash, messageCid })
  const first = renderHook(() => useDeletionRecovery(new Set(), onFailure), { wrapper: UploadHistoryProvider })
  await waitFor(() =>
    expect(getCachedPieces(scope)?.[0].deletion?.['1']).toEqual({
      transactionHash: replacementHash,
      confirmed: true,
      messageCid,
    })
  )
  first.unmount()
  renderHook(() => useDeletionRecovery(new Set(), onFailure), { wrapper: UploadHistoryProvider })
  await act(async () => undefined)
  expect(mocks.resolve).toHaveBeenCalledOnce()
  expect(mocks.submit).not.toHaveBeenCalled()
  expect(onFailure).not.toHaveBeenCalled()
})

it('does not inspect locally active deletion tasks', async () => {
  renderHook(() => useDeletionRecovery(new Set([file.pieceCid]), onFailure), { wrapper: UploadHistoryProvider })
  await act(async () => undefined)
  expect(mocks.resolve).not.toHaveBeenCalled()
})

it('skips content owned by another tab and checks on foreground resume', async () => {
  vi.useFakeTimers()
  const release = await acquireContentLock(scope, file.cid)
  renderHook(() => useDeletionRecovery(new Set(), onFailure), { wrapper: UploadHistoryProvider })
  await act(async () => undefined)
  expect(mocks.resolve).not.toHaveBeenCalled()
  await release()
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
  expect(mocks.resolve).toHaveBeenCalledOnce()
})

it('stops automatic polling after ten minutes, but checks again on resume and reload', async () => {
  vi.useFakeTimers()
  const first = renderHook(() => useDeletionRecovery(new Set(), onFailure), { wrapper: UploadHistoryProvider })
  await act(async () => undefined)
  expect(mocks.resolve).toHaveBeenCalledOnce()
  expect(first.result.current.has(file.pieceCid)).toBe(true)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000)
  })
  expect(first.result.current.has(file.pieceCid)).toBe(true)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10 * 60_000 - 15_000)
  })
  const count = mocks.resolve.mock.calls.length
  expect(first.result.current.has(file.pieceCid)).toBe(false)
  expect(count).toBe(20)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000)
  })
  expect(mocks.resolve).toHaveBeenCalledTimes(count)
  await act(async () => {
    document.dispatchEvent(new Event('resume'))
  })
  expect(mocks.resolve).toHaveBeenCalledTimes(count + 1)
  first.unmount()
  renderHook(() => useDeletionRecovery(new Set(), onFailure), { wrapper: UploadHistoryProvider })
  await act(async () => undefined)
  expect(mocks.resolve).toHaveBeenCalledTimes(count + 2)
  expect(mocks.submit).not.toHaveBeenCalled()
})

it('does not save stale results after switching wallets', async () => {
  let finish!: (result: unknown) => void
  mocks.resolve.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const { rerender } = renderHook(() => useDeletionRecovery(new Set(), onFailure), { wrapper: UploadHistoryProvider })
  await waitFor(() => expect(mocks.resolve).toHaveBeenCalledOnce())
  mocks.scope = null
  rerender()
  await act(async () => finish({ status: 'success', hash }))
  expect(getCachedPieces(scope)?.[0].deletion?.['1'].confirmed).toBe(false)
})

it('preserves RPC-unknown results but reports a proved reverted receipt without resubmitting', async () => {
  vi.useFakeTimers()
  mocks.resolve
    .mockResolvedValueOnce({ status: 'pending', messageCid })
    .mockResolvedValueOnce({ status: 'reverted', hash })
  renderHook(() => useDeletionRecovery(new Set(), onFailure), { wrapper: UploadHistoryProvider })
  await act(async () => undefined)
  expect(getCachedPieces(scope)?.[0].deletion?.['1']).toEqual({ transactionHash: hash, confirmed: false, messageCid })
  expect(onFailure).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000)
  })
  expect(onFailure).toHaveBeenCalledWith(file.pieceCid, expect.stringContaining('reverted'))
  expect(getCachedPieces(scope)?.[0].deletion?.['1']).toBeUndefined()
  expect(mocks.submit).not.toHaveBeenCalled()
})

it('checks different pending receipts across aliases without submitting missing copies', async () => {
  setCachedPieces(scope, [
    file,
    {
      ...file,
      id: 'alias',
      datasetId: '2',
      datasetIds: ['2'],
      deletion: { '2': { transactionHash: replacementHash, confirmed: false } },
    },
    { ...file, id: 'no-hash', pieceCid: 'other', cid: 'other-root', deletion: {} },
  ])
  mocks.resolve.mockImplementation(async (_client, transaction) => ({ status: 'success', hash: transaction.hash }))
  renderHook(() => useDeletionRecovery(new Set(), onFailure), { wrapper: UploadHistoryProvider })
  await waitFor(() => expect(getCachedPieces(scope)?.[1].deletion?.['2'].confirmed).toBe(true))
  expect(getCachedPieces(scope)?.[0].deletion?.['1'].confirmed).toBe(true)
  expect(mocks.resolve).toHaveBeenCalledTimes(2)
  expect(mocks.submit).not.toHaveBeenCalled()
})
