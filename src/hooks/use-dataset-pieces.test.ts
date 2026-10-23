import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getDetailedDataSetMock, useFilecoinPinContextMock, metadataMock } = vi.hoisted(() => ({
  getDetailedDataSetMock: vi.fn(),
  metadataMock: vi.fn(),
  useFilecoinPinContextMock: vi.fn(),
}))

vi.mock('../lib/filecoin-pin/piece-metadata.ts', () => ({ recoverPieceMetadata: metadataMock }))

vi.mock('filecoin-pin/core/data-set', () => ({
  getDetailedDataSet: getDetailedDataSetMock,
}))

vi.mock('./use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: useFilecoinPinContextMock,
}))

import { getCachedPieces, setCachedPieces } from '../lib/local-storage/piece-cache.ts'
import { type DatasetPiece, useDatasetPieces } from './use-dataset-pieces.ts'

const WALLET = '0xabc'

const readyWallet = { status: 'ready', data: { address: WALLET, network: 'calibration' } }

const makeContext = (dataSet: { status: string; dataSetIds?: bigint[] }) => ({
  wallet: readyWallet,
  synapse: {},
  dataSet,
})

const cachedPiece = (pieceCid: string): DatasetPiece =>
  ({
    id: `piece-${pieceCid}`,
    pieceCid,
    cid: 'bafyroot',
    fileName: 'a.txt',
    fileSize: '5 B',
    providerName: 'p',
    datasetId: '1',
    providerId: '4',
    serviceURL: '',
    transactionHash: '',
    network: 'calibration',
    uploadedAt: 0,
    pieceId: 1,
  }) as DatasetPiece

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  metadataMock.mockResolvedValue(new Map())
  getDetailedDataSetMock.mockResolvedValue({ pieces: [], provider: null })
})

afterEach(() => vi.restoreAllMocks())

describe('useDatasetPieces auto-load', () => {
  it('does not enumerate the chain when a dataset id appears mid-upload on a fresh browser', async () => {
    // Fresh browser: dataset manager has resolved ready with no ids, cache empty.
    useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [] }))
    const { rerender } = renderHook(() => useDatasetPieces())

    // Mid-upload, piecesConfirmed appends the freshly created dataset id,
    // flipping dataSetIds 0 -> 1 while the cache is still empty (addPiece only
    // writes at upload completion). History must NOT enumerate the chain here.
    useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [1n] }))
    await act(async () => {
      rerender()
    })

    expect(getDetailedDataSetMock).not.toHaveBeenCalled()
  })

  it('does not arm auto-load until the dataset manager is ready', async () => {
    // While the dataset manager is still initializing with no ids, the effect
    // must not mark itself loaded — otherwise the later idle->ready flip with
    // real ids would never trigger the one allowed enumeration.
    useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'initializing', dataSetIds: [] }))
    const { rerender } = renderHook(() => useDatasetPieces())

    useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [7n] }))
    await act(async () => {
      rerender()
    })

    await waitFor(() => expect(getDetailedDataSetMock).toHaveBeenCalledTimes(1))
    expect(getDetailedDataSetMock).toHaveBeenCalledWith(expect.anything(), 7n)
  })

  it('enumerates the chain once on load when ids are present and the cache is empty', async () => {
    useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [5n] }))

    renderHook(() => useDatasetPieces())

    await waitFor(() => expect(getDetailedDataSetMock).toHaveBeenCalledTimes(1))
    expect(getDetailedDataSetMock).toHaveBeenCalledWith(expect.anything(), 5n)
  })

  it('renders from the cache without any chain enumeration', async () => {
    setCachedPieces(WALLET, [cachedPiece('bafkcached')])
    useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [5n] }))

    const { result } = renderHook(() => useDatasetPieces())

    await waitFor(() => expect(result.current.hasLoaded).toBe(true))
    expect(getDetailedDataSetMock).not.toHaveBeenCalled()
    expect(result.current.pieces).toHaveLength(1)
  })
})

it('preserves file names, paths, CIDs and duplicate-content records when refreshing chain state', async () => {
  const original = { ...cachedPiece('piece'), id: 'file-1', folderPath: 'reports' }
  const alias = { ...original, id: 'file-2', fileName: 'renamed.txt' }
  setCachedPieces(WALLET, [original, alias])
  useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [1n] }))
  getDetailedDataSetMock.mockResolvedValue({
    pieces: [{ pieceCid: { toString: () => 'piece' }, size: 5, pieceId: 1 }],
    provider: null,
  })
  const { result } = renderHook(() => useDatasetPieces())
  await waitFor(() => expect(result.current.hasLoaded).toBe(true))
  await act(async () => result.current.refreshPieces())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.pieces).toMatchObject([original, alias])
})

it('adds newly discovered copies without counting repeated pieces in one dataset as extra copies', async () => {
  const original = { ...cachedPiece('piece'), folderPath: 'reports' }
  setCachedPieces(WALLET, [original])
  useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [1n, 2n] }))
  getDetailedDataSetMock.mockImplementation(async (_synapse, id) => ({
    pieces: [1, 2].map((pieceId) => ({ pieceCid: { toString: () => 'piece' }, size: 5, pieceId })),
    provider: { id, name: `provider-${id}`, pdp: { serviceURL: `https://provider-${id}.example` } },
  }))
  const { result } = renderHook(() => useDatasetPieces())
  await waitFor(() => expect(result.current.hasLoaded).toBe(true))
  await act(async () => result.current.refreshPieces())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.pieces[0]).toMatchObject({
    fileName: 'a.txt',
    folderPath: 'reports',
    cid: 'bafyroot',
    datasetIds: ['1', '2'],
    copyCount: 2,
    providerNames: ['p', 'provider-2'],
  })
})

it('retains a failed deletion checkpoint and retries it against the latest stored directory', async () => {
  const original = cachedPiece('piece')
  setCachedPieces(WALLET, [original])
  useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [1n] }))
  const { result } = renderHook(() => useDatasetPieces())
  await waitFor(() => expect(result.current.hasLoaded).toBe(true))
  const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Quota exceeded')
  })
  const checkpoint = {
    ...original,
    deletion: { '1': { transactionHash: `0x${'a'.repeat(64)}`, confirmed: false } },
  }
  await act(async () => {
    await expect(
      result.current.mutatePieces((current) =>
        current.map((file) => (file.id === original.id ? { ...file, deletion: checkpoint.deletion } : file))
      )
    ).rejects.toThrow('export a directory backup')
  })
  expect(result.current.pieces).toEqual([checkpoint])
  expect(result.current.error).toContain('Keep this page open')
  write.mockRestore()
  // A different tab saves another file while this page still holds its unsaved receipt.
  const added = cachedPiece('new')
  localStorage.setItem(`filecoin-pin-piece-cache-v1-${WALLET}`, JSON.stringify([original, added]))
  act(() => window.dispatchEvent(new Event('focus')))
  expect(result.current.pieces).toEqual([checkpoint, added])
  await act(async () => result.current.updatePiece(original.id, { fileName: 'renamed.txt' }))
  expect(getCachedPieces(WALLET)).toEqual([{ ...checkpoint, fileName: 'renamed.txt' }, added])
  expect(result.current.error).toBeNull()
})

it('keeps archived removal receipts stable when chain refresh discovers later copies of the same content', async () => {
  const archived = {
    ...cachedPiece('same-piece'),
    deletion: { '1': { confirmed: true, transactionHash: `0x${'a'.repeat(64)}` } },
  }
  setCachedPieces(WALLET, [archived])
  useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [1n, 2n] }))
  const { result } = renderHook(() => useDatasetPieces())
  await waitFor(() => expect(result.current.pieces).toHaveLength(1))
  getDetailedDataSetMock.mockResolvedValue({
    pieces: [{ pieceCid: { toString: () => 'same-piece' }, pieceId: 2, size: 5 }],
    provider: null,
  })
  await act(async () => result.current.refreshPieces())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(getDetailedDataSetMock).toHaveBeenCalledTimes(2)
  expect(result.current.pieces).toEqual([archived])
  await act(async () => result.current.addPiece({ ...cachedPiece('same-piece'), id: 'new-upload', datasetId: '2' }))
  expect(result.current.pieces).toHaveLength(2)
  expect(result.current.pieces.find((record) => record.id === 'new-upload')?.deletion).toBeUndefined()
})

it('preserves concurrent additions and patches from separate directory consumers', async () => {
  const original = cachedPiece('original')
  setCachedPieces(WALLET, [original])
  useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [] }))
  const tabA = renderHook(useDatasetPieces)
  const tabB = renderHook(useDatasetPieces)
  const newFile = cachedPiece('new')
  await act(async () => {
    await Promise.all([
      tabB.result.current.addPiece(newFile),
      tabA.result.current.updatePiece(original.id, { fileName: 'renamed.txt' }),
    ])
  })
  expect(getCachedPieces(WALLET)).toEqual([newFile, { ...original, fileName: 'renamed.txt' }])
  expect(tabA.result.current.pieces).toEqual(tabB.result.current.pieces)
})

it('merges later upload checkpoints without reverting user edits, indexing or deletion progress', async () => {
  const original = { ...cachedPiece('original'), ipfsIndexed: false }
  setCachedPieces(WALLET, [original])
  useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [] }))
  const { result } = renderHook(useDatasetPieces)
  const deletion = { '1': { transactionHash: `0x${'a'.repeat(64)}`, confirmed: false } }
  await act(async () => {
    await result.current.updatePiece(original.id, { fileName: 'renamed.txt', folderPath: 'reports' })
    await result.current.mutatePieces((current) => current.map((file) => ({ ...file, ipfsIndexed: true, deletion })))
    await result.current.addPiece({ ...original, datasetIds: ['1', '2'], providerIds: ['4', '5'], copyCount: 2 })
    // An older one-copy checkpoint can arrive after the final checkpoint was queued.
    await result.current.addPiece(original)
  })
  expect(getCachedPieces(WALLET)?.[0]).toMatchObject({
    fileName: 'renamed.txt',
    folderPath: 'reports',
    ipfsIndexed: true,
    deletion,
    datasetIds: ['1', '2'],
    copyCount: 2,
  })
})

it('reads local changes on resume without chain reads or write-back loops', async () => {
  const original = cachedPiece('original')
  setCachedPieces(WALLET, [original])
  useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [] }))
  const { result } = renderHook(useDatasetPieces)
  const write = vi.spyOn(localStorage, 'setItem')
  for (const event of ['focus', 'pageshow', 'visibilitychange', 'resume']) {
    const changed = { ...original, fileName: event }
    setCachedPieces(WALLET, [changed])
    write.mockClear()
    act(() => (event === 'visibilitychange' || event === 'resume' ? document : window).dispatchEvent(new Event(event)))
    expect(result.current.pieces).toEqual([changed])
    expect(write).not.toHaveBeenCalled()
  }
  expect(getDetailedDataSetMock).not.toHaveBeenCalled()
})

it('merges a delayed chain refresh against the directory saved while its RPC was pending', async () => {
  const original = cachedPiece('original')
  setCachedPieces(WALLET, [original])
  useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [1n] }))
  let finish!: (value: object) => void
  getDetailedDataSetMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const { result } = renderHook(useDatasetPieces)
  let refreshing!: Promise<void>
  act(() => {
    refreshing = result.current.refreshPieces()
  })
  const added = cachedPiece('new')
  await act(async () => {
    await result.current.addPiece(added)
    await result.current.updatePiece(original.id, { fileName: 'edited-during-refresh.txt' })
    finish({ pieces: [], provider: null })
    await refreshing
  })
  expect(getCachedPieces(WALLET)).toEqual([added, { ...original, fileName: 'edited-during-refresh.txt' }])
})

it('finishes a queued write in its original scope without changing the newly selected wallet', async () => {
  const original = cachedPiece('original')
  const otherScope = '314159:other-wallet'
  const other = cachedPiece('other')
  setCachedPieces(WALLET, [original])
  setCachedPieces(otherScope, [other])
  useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [] }))
  const { result, rerender } = renderHook(useDatasetPieces)
  let release!: () => void
  let acquired!: () => void
  const ready = new Promise<void>((resolve) => {
    acquired = resolve
  })
  const holding = navigator.locks.request(`filecoin-drive-directory-${WALLET}`, async () => {
    acquired()
    await new Promise<void>((resolve) => {
      release = resolve
    })
  })
  await ready
  let saving!: Promise<void>
  act(() => {
    saving = result.current.updatePiece(original.id, { fileName: 'old-wallet-edit.txt' })
  })
  useFilecoinPinContextMock.mockReturnValue({
    ...makeContext({ status: 'ready', dataSetIds: [] }),
    storageScope: otherScope,
  })
  rerender()
  expect(result.current.pieces).toEqual([other])
  await act(async () => {
    release()
    await holding
    await saving
  })
  expect(getCachedPieces(WALLET)?.[0].fileName).toBe('old-wallet-edit.txt')
  expect(result.current.pieces).toEqual([other])
  expect(getCachedPieces(otherScope)).toEqual([other])
})

it('does not replay failed file edits over another tab on a later upload checkpoint', async () => {
  const original = { ...cachedPiece('original'), folderPath: 'reports' }
  setCachedPieces(WALLET, [original])
  useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [] }))
  const { result } = renderHook(useDatasetPieces)
  const write = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
    throw new Error('Quota exceeded')
  })
  await act(async () => {
    await expect(
      result.current.updatePiece(original.id, { fileName: 'older-edit.txt', folderPath: 'older-folder' })
    ).rejects.toThrow('Unable to save')
  })
  write.mockRestore()
  // Another page saves a newer edit after this page's write failed.
  const newer = { ...original, fileName: 'newer-edit.txt', folderPath: 'newer-folder' }
  localStorage.setItem(`filecoin-pin-piece-cache-v1-${WALLET}`, JSON.stringify([newer]))
  const added = cachedPiece('new-upload')
  await act(async () => result.current.addPiece(added))
  expect(getCachedPieces(WALLET)).toEqual([added, newer])
  // An explicit user retry can still save the edit after storage recovers.
  await act(async () => result.current.updatePiece(original.id, { fileName: 'explicit-retry.txt' }))
  expect(getCachedPieces(WALLET)?.[1]).toMatchObject({ fileName: 'explicit-retry.txt', folderPath: 'newer-folder' })
})

it('uses event metadata on a missing directory, then preserves locally edited names on refresh', async () => {
  useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [1n] }))
  getDetailedDataSetMock.mockResolvedValue({ pieces: [{ pieceCid: 'piece', pieceId: 1n, size: 5 }], provider: null })
  metadataMock.mockResolvedValue(new Map([['1', { fileName: 'original.txt', cid: 'root' }]]))
  const { result } = renderHook(() => useDatasetPieces())
  await waitFor(() => expect(result.current.hasLoaded).toBe(true))
  expect(result.current.pieces[0]).toMatchObject({ fileName: 'original.txt', cid: 'root' })
  await act(async () =>
    result.current.updatePiece(result.current.pieces[0].id, { fileName: 'renamed.txt', folderPath: 'local' })
  )
  await act(async () => result.current.refreshPieces())
  expect(result.current.pieces[0]).toMatchObject({ fileName: 'renamed.txt', cid: 'root', folderPath: 'local' })
  expect(metadataMock.mock.calls[metadataMock.mock.calls.length - 1][2]).toEqual([])
})
