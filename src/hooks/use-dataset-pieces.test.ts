import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getDetailedDataSetMock, useFilecoinPinContextMock } = vi.hoisted(() => ({
  getDetailedDataSetMock: vi.fn(),
  useFilecoinPinContextMock: vi.fn(),
}))

vi.mock('filecoin-pin/core/data-set', () => ({
  getDetailedDataSet: getDetailedDataSetMock,
}))

vi.mock('./use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: useFilecoinPinContextMock,
}))

import { setCachedPieces } from '../lib/local-storage/piece-cache.ts'
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

it('retains an in-memory deletion checkpoint and reports failed persistence before continuing', async () => {
  const original = cachedPiece('piece')
  setCachedPieces(WALLET, [original])
  useFilecoinPinContextMock.mockReturnValue(makeContext({ status: 'ready', dataSetIds: [1n] }))
  const { result } = renderHook(() => useDatasetPieces())
  await waitFor(() => expect(result.current.hasLoaded).toBe(true))
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Quota exceeded')
  })
  const checkpoint = {
    ...original,
    deletion: { '1': { transactionHash: `0x${'a'.repeat(64)}`, confirmed: false } },
  }
  act(() => {
    expect(() => result.current.replacePieces([checkpoint])).toThrow('export a directory backup')
  })
  expect(result.current.pieces).toEqual([checkpoint])
  expect(result.current.error).toContain('Keep this page open')
})
