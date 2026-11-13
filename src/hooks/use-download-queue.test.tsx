import type { Synapse } from '@filoz/synapse-sdk'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { getCachedPieces, setCachedPieces } from '../lib/local-storage/piece-cache.ts'
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

it('persists a decrypted root against the latest directory without replacing concurrent changes', async () => {
  setCachedPieces('owner', [file])
  let finish!: (root: string) => void
  mocks.download.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve
      })
  )
  const { result } = renderHook(() => useDownloadQueue({} as Synapse, 'owner'))
  act(() => result.current.enqueueDownload(file))
  const updated = { ...file, fileName: 'new name.pdf', deletion: { '7': { transactionHash: 'tx', confirmed: false } } }
  const unrelated = { ...file, id: 'another', cid: 'another-root' }
  setCachedPieces('owner', [updated, unrelated])
  await act(async () => finish('inner-root'))
  expect(getCachedPieces('owner')).toEqual([{ ...updated, contentRootCid: 'inner-root' }, unrelated])
  expect(result.current.downloadError).toBeNull()
})

it.each(['removed', 'replaced', 'wallet changed', 'unmounted'] as const)(
  'does not write a decrypted root after the record is %s',
  async (change) => {
    setCachedPieces('owner', [file])
    setCachedPieces('other-owner', [file])
    let finish!: (root: string) => void
    mocks.download.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        })
    )
    const view = renderHook(({ scope }) => useDownloadQueue({} as Synapse, scope), { initialProps: { scope: 'owner' } })
    act(() => view.result.current.enqueueDownload(file))
    const current = change === 'removed' ? [] : change === 'replaced' ? [{ ...file, cid: 'replacement' }] : [file]
    setCachedPieces('owner', current)
    if (change === 'wallet changed') view.rerender({ scope: 'other-owner' })
    if (change === 'unmounted') view.unmount()
    await act(async () => finish('inner-root'))
    expect(getCachedPieces('owner')).toEqual(current)
    expect(getCachedPieces('other-owner')).toEqual([file])
  }
)

it('reports metadata persistence failure separately from the completed download', async () => {
  setCachedPieces('owner', [file])
  mocks.download.mockResolvedValue('inner-root')
  const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Quota exceeded')
  })
  try {
    const { result } = renderHook(() => useDownloadQueue({} as Synapse, 'owner'))
    act(() => result.current.enqueueDownload(file))
    await waitFor(() => expect(result.current.downloadError).toContain('File downloaded, but'))
    expect(result.current.download).toBeNull()
  } finally {
    write.mockRestore()
    setCachedPieces('owner', [])
  }
})
