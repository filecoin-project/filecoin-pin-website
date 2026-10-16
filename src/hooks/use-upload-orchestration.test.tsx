import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('../lib/filecoin-pin/storage-chain.ts', () => ({ assertCurrentStorageChain: vi.fn() }))

vi.mock('filecoin-pin/core/upload', () => ({
  executeUpload: mocks.execute,
  checkUploadReadiness: vi.fn().mockResolvedValue({ status: 'ready' }),
}))
vi.mock('filecoin-pin/core/unixfs', () => ({
  createCarFromFile: vi.fn().mockResolvedValue({
    rootCid: { toString: () => 'bafkreigh2akiscaildcgck5x5wqlooqkztdxqv5t5uwmybnv5brkw4zj3m' },
    carBytes: new Uint8Array([1]),
  }),
}))
vi.mock('../lib/filecoin-pin/fresh-contexts.ts', () => ({
  createFreshUploadContexts: vi
    .fn()
    .mockResolvedValue([{ provider: { id: 4n, name: 'Primary' } }, { provider: { id: 5n, name: 'Secondary' } }]),
}))
vi.mock('./use-filecoin-pin-context.ts', () => ({ useFilecoinPinContext: () => context }))

import { UploadError } from '../components/upload/upload-error.tsx'
import type { FilecoinPinContextValue } from '../context/filecoin-pin-provider.tsx'
import { UploadHistoryProvider, useUploadHistory } from '../context/upload-history-context.tsx'
import { getCachedPieces } from '../lib/local-storage/piece-cache.ts'
import { useUploadOrchestration } from './use-upload-orchestration.ts'

const scope = '314:0x1111111111111111111111111111111111111111'
const context = {
  synapse: { storage: { prepare: vi.fn().mockResolvedValue({ costs: { ready: true } }) } },
  storageScope: scope,
  dataSet: { status: 'ready', dataSetIds: [] },
  wallet: {
    status: 'ready',
    data: { address: scope.slice(4), network: 'mainnet' },
  } as FilecoinPinContextValue['wallet'],
  addDataSetId: vi.fn(),
  ensurePermissions: vi.fn().mockResolvedValue(undefined),
  debugParams: { providerId: null, dataSetId: null },
}
const hashA = `0x${'a'.repeat(64)}`
const hashB = `0x${'b'.repeat(64)}`
let progress: (event: unknown) => void
let finish: (value: unknown) => void
let fail: (error: Error) => void
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  context.wallet = {
    status: 'ready',
    data: { address: scope.slice(4), network: 'mainnet' },
  } as FilecoinPinContextValue['wallet']
  mocks.execute.mockImplementation(async (_synapse, _bytes, _cid, options) => {
    progress = options.onProgress
    progress({
      type: 'stored',
      data: {
        providerId: 4n,
        pieceCid: { toString: () => 'bafkzcibcd4bdomn3tgwgrh3g532zopskstnbrd2n3sxfqbze7rxt7vqn7veigmy' },
      },
    })
    progress({ type: 'piecesAdded', data: { providerId: 4n, txHash: hashA } })
    progress({ type: 'piecesConfirmed', data: { dataSetId: 1n, providerId: 4n, pieceIds: [10n] } })
    return new Promise((resolve, reject) => {
      finish = resolve
      fail = reject
    })
  })
})

describe('durable upload directory checkpoints', () => {
  it('keeps confirmed file metadata when later replication or indexing fails', async () => {
    const { result } = renderHook(useUploadOrchestration, { wrapper: UploadHistoryProvider })
    act(() => {
      void result.current.startUpload(new File(['hello'], '研究.txt'), 'reports/2026')
    })
    await waitFor(() => expect(getCachedPieces(scope)).toHaveLength(1))
    expect(result.current.activeUpload.isUploading).toBe(true)
    const checkpoint = getCachedPieces(scope)?.[0]
    expect(checkpoint).toMatchObject({
      fileName: '研究.txt',
      folderPath: 'reports/2026',
      datasetIds: ['1'],
      transactionHashes: [hashA],
      copyCount: 1,
      ipfsIndexed: false,
    })
    act(() => fail(new Error('Indexer unavailable after chain confirmation')))
    await waitFor(() => expect(result.current.activeUpload.error).toContain('Indexer unavailable'))
    expect(getCachedPieces(scope)).toEqual([checkpoint])
  })

  it('updates the same record with additional confirmed copies and their correct transaction links', async () => {
    const { result } = renderHook(useUploadOrchestration, { wrapper: UploadHistoryProvider })
    act(() => {
      void result.current.startUpload(new File(['hello'], 'report.txt'), 'reports')
    })
    await waitFor(() => expect(getCachedPieces(scope)).toHaveLength(1))
    const id = getCachedPieces(scope)?.[0].id
    act(() => {
      progress({ type: 'copyComplete', data: { providerId: 5n } })
      progress({ type: 'piecesAdded', data: { providerId: 5n, txHash: hashB } })
      progress({ type: 'piecesConfirmed', data: { dataSetId: 2n, providerId: 5n, pieceIds: [20n] } })
      progress({ type: 'ipniProviderResults:complete', data: {} })
      finish({
        copies: [
          { role: 'primary', providerId: 4n, dataSetId: 1n, pieceId: 10n },
          { role: 'secondary', providerId: 5n, dataSetId: 2n, pieceId: 20n },
        ],
        network: 'mainnet',
      })
    })
    await waitFor(() => expect(result.current.uploadedFile).toBeNull())
    expect(getCachedPieces(scope)).toHaveLength(1)
    expect(getCachedPieces(scope)?.[0]).toMatchObject({
      id,
      copyCount: 2,
      datasetIds: ['1', '2'],
      transactionHashes: [hashA, hashB],
      ipfsIndexed: true,
    })
  })
})

it.each(['loading', 'error'] as const)(
  'keeps the upload network when balance refresh changes wallet status to %s',
  async (status) => {
    const { result, rerender } = renderHook(useUploadOrchestration, { wrapper: UploadHistoryProvider })
    act(() => {
      void result.current.startUpload(new File(['hello'], 'partial-mainnet.txt'))
    })
    await waitFor(() => expect(getCachedPieces(scope)).toHaveLength(1))
    expect(result.current.activeUpload.network).toBe('mainnet')
    act(() => fail(new Error('Secondary failed after primary confirmed')))
    await waitFor(() => expect(result.current.activeUpload.error).toBeTruthy())
    context.wallet = status === 'loading' ? { status } : { status, error: 'Balance RPC unavailable' }
    rerender()
    expect(getCachedPieces(scope)?.[0].network).toBe('mainnet')
    expect(result.current.activeUpload.network).toBe('mainnet')
  }
)

it.each(['retry button', 'another directory save'] as const)(
  'recovers a completed upload through %s without uploading it again',
  async (recovery) => {
    const { result } = renderHook(
      () => ({
        upload: useUploadOrchestration(),
        directory: useUploadHistory(),
      }),
      { wrapper: UploadHistoryProvider }
    )
    act(() => {
      void result.current.upload.startUpload(new File(['hello'], 'report.txt'))
    })
    await waitFor(() => expect(getCachedPieces(scope)).toHaveLength(1))
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    try {
      await act(async () => {
        progress({ type: 'ipniProviderResults:complete', data: {} })
        finish({ copies: [{ role: 'primary', providerId: 4n, dataSetId: 1n, pieceId: 10n }], network: 'mainnet' })
      })
      await waitFor(() => expect(result.current.upload.directorySaveError).toContain('export a directory backup'))
      expect(result.current.upload.activeUpload.isUploading).toBe(false)
      expect(result.current.upload.uploadedFile).not.toBeNull()
      const checkpoint = getCachedPieces(scope)?.[0]
      if (!checkpoint) throw new Error('Missing upload checkpoint')
      write.mockRestore()
      if (recovery === 'retry button') {
        render(<UploadError orchestration={result.current.upload} />)
        expect(screen.queryByRole('button', { name: 'Retry Upload' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
      } else {
        await act(async () => result.current.directory.updateUpload(checkpoint.id, { fileName: 'renamed.txt' }))
      }
      await waitFor(() => expect(result.current.upload.uploadedFile).toBeNull())
      expect(result.current.upload.directorySaveError).toBeNull()
      expect(result.current.directory.hasUnsavedChanges).toBe(false)
      const persisted = JSON.parse(localStorage.getItem(`filecoin-pin-piece-cache-v1-${scope}`) ?? '[]')[0]
      expect(persisted).toMatchObject({ id: checkpoint.id, ipfsIndexed: true, transactionHashes: [hashA] })
      expect(mocks.execute).toHaveBeenCalledOnce()
    } finally {
      write.mockRestore()
    }
  }
)
