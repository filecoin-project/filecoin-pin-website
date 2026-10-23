import type { Synapse } from '@filoz/synapse-sdk'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ head: vi.fn(), logs: vi.fn() }))
vi.mock('viem/actions', async (original) => ({
  ...(await original<object>()),
  getBlockNumber: mocks.head,
  getLogs: mocks.logs,
}))

import { recoverPieceMetadata } from './piece-metadata.ts'

const synapse = {
  readClient: {},
  chain: { contracts: { fwss: { address: '0x1111111111111111111111111111111111111111' } } },
} as unknown as Synapse
const cid = 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.head.mockResolvedValue(1000n)
  mocks.logs.mockResolvedValue([])
})
it('recovers label/name and CID by piece id, across bounded non-overlapping pages', async () => {
  mocks.logs
    .mockResolvedValueOnce([{ args: { pieceId: 2n, keys: ['name', 'ipfsRootCID'], values: ['cli.txt', cid] } }])
    .mockResolvedValueOnce([{ args: { pieceId: 1n, keys: ['label', 'ipfsRootCID'], values: ['研究.txt', cid] } }])
  const result = await recoverPieceMetadata(synapse, 7n, [1n, 2n])
  expect(result.get('1')).toEqual({ fileName: '研究.txt', cid })
  expect(result.get('2')).toEqual({ fileName: 'cli.txt', cid })
  expect(mocks.logs.mock.calls.map(([, options]) => [options.fromBlock, options.toBlock])).toEqual([
    [641n, 1000n],
    [281n, 640n],
  ])
  expect(mocks.logs.mock.calls[0][1].args).toEqual({ dataSetId: 7n })
})
it('keeps partial results when the RPC cannot read older logs', async () => {
  mocks.logs
    .mockResolvedValueOnce([{ args: { pieceId: 1n, keys: ['label', 'ipfsRootCID'], values: ['one.txt', 'invalid'] } }])
    .mockRejectedValueOnce(new Error('archive unavailable'))
  const result = await recoverPieceMetadata(synapse, 7n, [1n, 2n])
  expect(result.get('1')).toEqual({ fileName: 'one.txt', cid: undefined })
  expect(result.has('2')).toBe(false)
})
it('does no RPC reads when no metadata is missing', async () => {
  expect((await recoverPieceMetadata(synapse, 7n, [])).size).toBe(0)
  expect(mocks.head).not.toHaveBeenCalled()
})
it('stops when the directory scope is abandoned', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(recoverPieceMetadata(synapse, 7n, [1n], controller.signal)).rejects.toThrow()
  expect(mocks.logs).not.toHaveBeenCalled()
})

it('bounds missing-metadata recovery instead of scanning the entire chain', async () => {
  mocks.head.mockResolvedValue(100_000n)
  expect((await recoverPieceMetadata(synapse, 7n, [1n])).size).toBe(0)
  expect(mocks.logs).toHaveBeenCalledTimes(64)
})
