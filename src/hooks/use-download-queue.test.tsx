import type { Synapse } from '@filoz/synapse-sdk'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { DatasetPiece } from './use-dataset-pieces.ts'

const mocks = vi.hoisted(() => ({ download: vi.fn(), neutral: vi.fn() }))
vi.mock('../context/browser-wallet-provider.tsx', () => ({ useBrowserWallet: () => ({ ownerSigner: vi.fn() }) }))
vi.mock('./use-filecoin-pin-context.ts', () => ({ useFilecoinPinContext: () => ({ encryption: { ready: false } }) }))
vi.mock('../lib/filecoin-pin/download.ts', () => ({ downloadFile: mocks.download, decryptCredentials: () => ({}) }))
vi.mock('../lib/filecoin-pin/drive-api.ts', () => ({ displayFileName: (file: { fileName: string }) => file.fileName }))
vi.mock('../utils/toast.tsx', () => ({ toast: { neutral: mocks.neutral } }))

import { useDownloadQueue } from './use-download-queue.ts'

const file: DatasetPiece = {
  id: 'test',
  fileName: 'report.pdf',
  cid: 'root',
  pieceCid: 'piece',
  fileSize: '1 KB',
  providerName: '',
  providerId: '',
  datasetId: '',
  serviceURL: '',
  transactionHash: '',
  network: 'mainnet',
  uploadedAt: 0,
}
beforeEach(() => {
  mocks.download.mockReset()
  mocks.neutral.mockReset()
})
it('clears progress and uses a neutral cancellation message without leaving a download error', async () => {
  mocks.download
    .mockRejectedValueOnce(new Error('RPC failed', { cause: Object.assign(new Error('Rejected'), { code: 4001 }) }))
    .mockResolvedValueOnce(undefined)
  const { result } = renderHook(() => useDownloadQueue({} as Synapse, 'owner'))
  act(() => result.current.enqueueDownload(file))
  await waitFor(() =>
    expect(mocks.neutral).toHaveBeenCalledWith('Download cancelled. Sign with your wallet to decrypt this upload.')
  )
  expect(result.current.download).toBeNull()
  expect(result.current.downloadError).toBeNull()
  expect(mocks.download).toHaveBeenCalledTimes(1)
  act(() => result.current.enqueueDownload(file))
  await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(2))
})
it('keeps real network errors visible', async () => {
  mocks.download.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  const { result } = renderHook(() => useDownloadQueue({} as Synapse, 'owner'))
  act(() => result.current.enqueueDownload(file))
  await waitFor(() => expect(result.current.downloadError).toBe('report.pdf: Failed to fetch'))
  expect(mocks.neutral).not.toHaveBeenCalled()
})
