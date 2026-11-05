import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ recover: vi.fn(), load: vi.fn().mockResolvedValue([]) }))
vi.mock('../lib/filecoin-pin/recover-upload.ts', async (original) => ({
  ...(await original<object>()),
  recoverUpload: mocks.recover,
}))
vi.mock('../lib/filecoin-pin/drive-api.ts', async (original) => ({
  ...(await original<object>()),
  loadDriveFiles: mocks.load,
}))
vi.mock('../hooks/use-filecoin-pin-context.ts', () => ({ useFilecoinPinContext: () => context }))
vi.mock('../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({ address: '0xabc', network: 'mainnet' }),
}))

import { UploadHistoryProvider } from '../context/upload-history-context.tsx'
import { acquireContentLock } from '../lib/filecoin-pin/content-lock.ts'
import { getCachedPieces, setCachedPieces } from '../lib/local-storage/piece-cache.ts'
import type { DatasetPiece } from './use-dataset-pieces.ts'
import { useUploadRecovery } from './use-upload-recovery.ts'

const scope = '314:0xabc'
const context = { synapse: {}, storageScope: scope, addDataSetId: vi.fn() }
const file: DatasetPiece = {
  id: 'task',
  fileName: 'one.txt',
  fileSize: '1 B',
  cid: 'root',
  pieceCid: 'piece',
  datasetId: '',
  datasetIds: [],
  providerId: '4',
  providerName: 'SP',
  serviceURL: 'https://sp.example',
  transactionHash: '',
  network: 'mainnet',
  uploadedAt: 1,
  upload: { phase: 'pending', expectedCopies: 1, providers: [], steps: [], checks: 0, nextCheckAt: 0 },
}
beforeEach(() => {
  vi.clearAllMocks()
  setCachedPieces(scope, [structuredClone(file)])
  mocks.recover.mockImplementation(async (_synapse, record) => ({
    ...record,
    upload: { ...record.upload, phase: 'complete' },
  }))
})
it('recovers a persisted task after remount without replaying an upload', async () => {
  const first = renderHook(() => useUploadRecovery(new Set()), { wrapper: UploadHistoryProvider })
  await waitFor(() => expect(getCachedPieces(scope)?.[0].upload?.phase).toBe('complete'))
  expect(getCachedPieces(scope)?.[0].upload?.checks).toBe(1)
  first.unmount()
  const next = renderHook(() => useUploadRecovery(new Set()), { wrapper: UploadHistoryProvider })
  await act(async () => undefined)
  expect(mocks.recover).toHaveBeenCalledOnce()
  next.unmount()
})
it('preserves the automatic check budget across reloads but permits an explicit check', async () => {
  if (!file.upload) throw new Error('Missing fixture checkpoint')
  setCachedPieces(scope, [{ ...file, upload: { ...file.upload, checks: 20 } }])
  const { result } = renderHook(() => useUploadRecovery(new Set()), { wrapper: UploadHistoryProvider })
  await act(async () => undefined)
  expect(mocks.recover).not.toHaveBeenCalled()
  const loadsBefore = mocks.load.mock.calls.length
  await act(async () => result.current.check(file.id))
  expect(mocks.load).toHaveBeenCalledTimes(loadsBefore + 1)
  expect(mocks.recover).toHaveBeenCalledOnce()
})
it('does not inspect a task still owned by another tab', async () => {
  const release = await acquireContentLock(`${scope}:upload-task`, file.id)
  const { result } = renderHook(() => useUploadRecovery(new Set()), { wrapper: UploadHistoryProvider })
  await act(async () => undefined)
  expect(mocks.recover).not.toHaveBeenCalled()
  await release()
  await act(async () => result.current.check(file.id))
  expect(mocks.recover).toHaveBeenCalledOnce()
})

it('manual Check status recovers an API-only second copy after the automatic check budget expires', async () => {
  const partial: DatasetPiece = {
    ...file,
    datasetId: '1879',
    datasetIds: ['1879'],
    pieceId: 4,
    providerId: '1',
    copyCount: 1,
    upload: {
      phase: 'interrupted',
      expectedCopies: 2,
      steps: [],
      checks: 20,
      nextCheckAt: 0,
      providers: [
        { providerId: '1', serviceURL: '', dataSetId: '1879', pieceId: '4', confirmed: true },
        { providerId: '32', serviceURL: '' },
      ],
    },
  }
  mocks.load.mockResolvedValue([])
  setCachedPieces(scope, [partial])
  const { result } = renderHook(() => useUploadRecovery(new Set()), { wrapper: UploadHistoryProvider })
  await act(async () => undefined)
  mocks.load.mockResolvedValue([
    {
      ...file,
      id: 'indexed-1881-0',
      datasetId: '1881',
      datasetIds: ['1881'],
      pieceId: 0,
      providerId: '32',
      copyCount: 1,
      uploadedAt: 2000,
      upload: undefined,
    },
  ])
  await act(async () => result.current.check(file.id))
  expect(getCachedPieces(scope)?.[0].copyCount).toBe(2)
  expect(getCachedPieces(scope)?.[0].upload?.phase).toBe('complete')
  expect(mocks.recover).not.toHaveBeenCalled()
})
