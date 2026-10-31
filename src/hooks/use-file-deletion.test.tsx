import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), receipt: vi.fn(), setDeleting: vi.fn() }))
vi.mock('../lib/filecoin-pin/transaction-receipt.ts', () => ({ resolveTransactionReceipt: mocks.resolve }))
vi.mock('../lib/filecoin-pin/browser-wallet.ts', () => ({
  publicClient: () => ({ waitForTransactionReceipt: mocks.receipt }),
}))
vi.mock('../lib/filecoin-pin/drive-api.ts', async (original) => ({
  ...(await original<object>()),
  loadDriveFiles: async () => [],
}))
vi.mock('./use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    synapse: {},
    storageScope: '314:0xabc',
    ensurePermissions: async () => undefined,
    addDataSetId: () => undefined,
  }),
}))
vi.mock('../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({ address: '0xabc', network: 'mainnet', busy: false, setDeleting: mocks.setDeleting }),
}))

import { UploadHistoryProvider } from '../context/upload-history-context.tsx'
import { getCachedPieces, setCachedPieces } from '../lib/local-storage/piece-cache.ts'
import type { DatasetPiece } from './use-dataset-pieces.ts'
import { useFileDeletion } from './use-file-deletion.ts'

const hash = `0x${'a'.repeat(64)}` as const
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
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  setCachedPieces('314:0xabc', [file])
})
afterEach(() => {
  vi.useRealTimers()
})
it('blocks manual continuation without a conflict error throughout automatic checking', async () => {
  let finish!: (value: unknown) => void
  mocks.resolve
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    .mockResolvedValue({ status: 'pending' })
  const { result } = renderHook(() => useFileDeletion(), { wrapper: UploadHistoryProvider })
  await act(async () => undefined)
  expect(result.current.autoCheckingPieceCids.has(file.pieceCid)).toBe(true)
  await act(async () => {
    expect(await result.current.deleteFile(file)).toBe(false)
  })
  expect(result.current.deletionErrors).toEqual({})
  expect(mocks.setDeleting).not.toHaveBeenCalled()
  await act(async () => finish({ status: 'pending' }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000)
  })
  expect(result.current.autoCheckingPieceCids.has(file.pieceCid)).toBe(true)
})
it('clears a stale RPC error after automatic confirmation succeeds', async () => {
  setCachedPieces('314:0xabc', [{ ...file, deletion: {} }])
  const { result } = renderHook(() => useFileDeletion(), { wrapper: UploadHistoryProvider })
  await act(async () => undefined)
  setCachedPieces('314:0xabc', [file])
  mocks.resolve.mockResolvedValue({ status: 'pending' })
  mocks.receipt.mockRejectedValue(new Error('RPC unavailable'))
  await act(async () => {
    await result.current.deleteFile(file)
  })
  expect(result.current.deletionErrors.piece).toBe('RPC unavailable')
  expect(result.current.autoCheckingPieceCids.has(file.pieceCid)).toBe(true)
  mocks.resolve.mockResolvedValue({ status: 'success', hash })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000)
  })
  expect(getCachedPieces('314:0xabc')?.[0].deletion?.['1'].confirmed).toBe(true)
  expect(result.current.deletionErrors).toEqual({})
  expect(result.current.autoCheckingPieceCids.has(file.pieceCid)).toBe(false)
})
