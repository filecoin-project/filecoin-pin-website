import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const { load, context } = vi.hoisted(() => ({ load: vi.fn(), context: vi.fn() }))
vi.mock('../lib/filecoin-pin/drive-api.ts', async (original) => ({
  ...(await original<object>()),
  loadDriveFiles: load,
}))
vi.mock('./use-filecoin-pin-context.ts', () => ({ useFilecoinPinContext: context }))
vi.mock('./use-ipfs-indexing.ts', () => ({ useIpfsIndexing: vi.fn() }))

import { getCachedPieces, setCachedPieces } from '../lib/local-storage/piece-cache.ts'
import { type DatasetPiece, useDatasetPieces } from './use-dataset-pieces.ts'

const scope = '314:0xabc'
const file = {
  id: 'local',
  fileName: 'local.txt',
  folderPath: 'old',
  pieceCid: 'piece',
  cid: 'root',
  datasetId: '1',
  pieceId: 0,
  network: 'mainnet',
} as DatasetPiece
const synapse = {}
const addDataSetId = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  load.mockResolvedValue([])
  context.mockReturnValue({
    wallet: { status: 'ready', data: { address: '0xabc', network: 'mainnet' } },
    storageScope: scope,
    synapse,
    addDataSetId,
  })
})
it('discovers indexed files even with no local dataset IDs or cache', async () => {
  load.mockResolvedValue([file])
  const { result } = renderHook(useDatasetPieces)
  await waitFor(() => expect(result.current.pieces).toHaveLength(1))
  expect(load).toHaveBeenCalledWith(synapse, '0xabc', 'mainnet', expect.any(AbortSignal))
  expect(addDataSetId).toHaveBeenCalledWith(1n)
})
it('keeps local records when the index lags or fails, and supports manual retry', async () => {
  setCachedPieces(scope, [file])
  const { result } = renderHook(useDatasetPieces)
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.pieces).toEqual([file])
  load.mockRejectedValueOnce(new Error('index unavailable'))
  await act(async () => result.current.refreshPieces())
  expect(result.current.pieces).toEqual([file])
  expect(result.current.error).toBe('index unavailable')
  expect(getCachedPieces(scope)).toEqual([file])
})
it('merges a late index response against uploads saved while fetching', async () => {
  let finish!: (files: DatasetPiece[]) => void
  load.mockImplementation(
    () =>
      new Promise<DatasetPiece[]>((resolve) => {
        finish = resolve
      })
  )
  const { result } = renderHook(useDatasetPieces)
  await act(async () => {
    await result.current.addPiece(file)
  })
  await act(async () => finish([]))
  expect(result.current.pieces).toEqual([file])
})
it('ignores an aborted response after switching wallets', async () => {
  let finish!: (files: DatasetPiece[]) => void
  load.mockImplementationOnce(
    () =>
      new Promise<DatasetPiece[]>((resolve) => {
        finish = resolve
      })
  )
  const { result, rerender } = renderHook(useDatasetPieces)
  context.mockReturnValue({
    wallet: { status: 'ready', data: { address: '0xdef', network: 'mainnet' } },
    storageScope: '314:0xdef',
    synapse,
    addDataSetId,
  })
  rerender()
  await act(async () => finish([file]))
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.pieces).toEqual([])
  expect(getCachedPieces('314:0xdef')).toEqual([])
})
