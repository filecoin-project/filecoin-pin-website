import { act, renderHook } from '@testing-library/react'
import { checkIpniIndexer } from 'filecoin-pin/core/utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DatasetPiece } from './use-dataset-pieces.ts'
import {
  IPFS_CHECK_INTERVAL,
  readIndexingChecks,
  reserveIndexingCheck,
  resetIndexingChecks,
  useIpfsIndexing,
} from './use-ipfs-indexing.ts'

vi.mock('filecoin-pin/core/utils', () => ({ checkIpniIndexer: vi.fn() }))
const cid = 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe'
const file = { id: 'one', cid, ipfsIndexed: false } as DatasetPiece
beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(checkIpniIndexer).mockReset().mockResolvedValue(false)
})
afterEach(() => vi.useRealTimers())

it('persists five attempts and cooldown across reloads and isolates wallets', () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const now = attempt * IPFS_CHECK_INTERVAL
    expect(reserveIndexingCheck('wallet-a', cid, now)?.attempts).toBe(attempt + 1)
    expect(reserveIndexingCheck('wallet-a', cid, now + 1000)).toBeNull()
  }
  expect(reserveIndexingCheck('wallet-a', cid, 1_000_000)).toBeNull()
  expect(readIndexingChecks('wallet-a')[cid].attempts).toBe(5)
  expect(reserveIndexingCheck('wallet-b', cid, 1_000_000)?.attempts).toBe(1)
})

it('stops after five misses, including network errors, and does not restart on remount', async () => {
  vi.mocked(checkIpniIndexer).mockRejectedValue(new Error('network unavailable'))
  const update = vi.fn()
  const hook = renderHook(() => useIpfsIndexing('wallet-a', [file, { ...file, id: 'duplicate' }], update))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000 + 5 * IPFS_CHECK_INTERVAL)
  })
  expect(checkIpniIndexer).toHaveBeenCalledTimes(5)
  expect(update).toHaveBeenCalledWith(cid, false, 5)
  hook.unmount()
  renderHook(() => useIpfsIndexing('wallet-a', [file], update))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3 * IPFS_CHECK_INTERVAL)
  })
  expect(checkIpniIndexer).toHaveBeenCalledTimes(5)
})

it('updates duplicate records by CID, remembers success and stops checking', async () => {
  vi.mocked(checkIpniIndexer).mockResolvedValue(true)
  const update = vi.fn()
  const hook = renderHook(() => useIpfsIndexing('wallet-a', [file], update))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
  expect(update).toHaveBeenCalledWith(cid, true, 1)
  expect(readIndexingChecks('wallet-a')[cid].indexed).toBe(true)
  hook.unmount()
  renderHook(() => useIpfsIndexing('wallet-a', [file], update))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(IPFS_CHECK_INTERVAL)
  })
  expect(checkIpniIndexer).toHaveBeenCalledTimes(1)
})

it('skips deleted records and aborts outstanding requests when switching wallets', async () => {
  let signal: AbortSignal | undefined
  vi.mocked(checkIpniIndexer).mockImplementation((_cid, options) => {
    signal = options.signal
    return new Promise(() => {
      // Keep the request pending to exercise cleanup.
    })
  })
  const update = vi.fn()
  const hook = renderHook(
    ({ scope }) => useIpfsIndexing(scope, [file, { ...file, cid: 'deleted', deletion: {} }], update),
    {
      initialProps: { scope: 'wallet-a' },
    }
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
  expect(checkIpniIndexer).toHaveBeenCalledTimes(1)
  hook.rerender({ scope: 'wallet-b' })
  expect(signal?.aborted).toBe(true)
  expect(update).not.toHaveBeenCalled()
})

it('allows a new bounded round only when checks are explicitly reset', () => {
  for (let i = 0; i < 5; i++) reserveIndexingCheck('wallet-a', cid, i * IPFS_CHECK_INTERVAL)
  expect(reserveIndexingCheck('wallet-a', cid, 1_000_000)).toBeNull()
  resetIndexingChecks('wallet-a', cid)
  expect(reserveIndexingCheck('wallet-a', cid, 1_000_000)?.attempts).toBe(1)
})

it('does not make requests if the browser cannot persist the retry budget', async () => {
  const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Quota exceeded')
  })
  const hook = renderHook(() => useIpfsIndexing('wallet-a', [file], vi.fn()))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000)
  })
  expect(checkIpniIndexer).not.toHaveBeenCalled()
  hook.unmount()
  write.mockRestore()
})

it('reuses an already confirmed CID for a duplicate record without downgrading it', async () => {
  const update = vi.fn()
  renderHook(() => useIpfsIndexing('wallet-a', [file, { ...file, id: 'confirmed', ipfsIndexed: true }], update))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(checkIpniIndexer).not.toHaveBeenCalled()
  expect(update).toHaveBeenCalledWith(cid, true, 0)
})
