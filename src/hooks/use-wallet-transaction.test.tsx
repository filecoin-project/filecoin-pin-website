import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type RenderHookOptions, renderHook as renderBaseHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ wait: vi.fn(), receipt: vi.fn() }))
vi.mock('../lib/filecoin-pin/browser-wallet.ts', async (original) => ({
  ...(await original<typeof import('../lib/filecoin-pin/browser-wallet.ts')>()),
  publicClient: () => ({ waitForTransactionReceipt: mocks.wait, getTransactionReceipt: mocks.receipt }),
}))

import { readWalletTransaction } from '../lib/local-storage/wallet-transaction.ts'
import { PendingWalletTransactionError, useWalletTransaction } from './use-wallet-transaction.ts'

function renderHook<Result, Props>(callback: (props: Props) => Result, options?: RenderHookOptions<Props>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderBaseHook(callback, {
    ...options,
    wrapper: ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children),
  })
}

const address = '0x1111111111111111111111111111111111111111'
const hash = `0x${'a'.repeat(64)}` as const
const reconcile = vi.fn()
const confirmed = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  mocks.wait.mockRejectedValue(new Error('timeout'))
  mocks.receipt.mockRejectedValue(new Error('receipt not found'))
  reconcile.mockResolvedValue(false)
  confirmed.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

it('retains a timed-out deposit, then recovers on foreground without sending again', async () => {
  const { result } = renderHook(() => useWalletTransaction(address, 'mainnet', false, reconcile, confirmed))
  await act(async () => {
    await expect(result.current.confirm(hash, 'deposit')).rejects.toBeInstanceOf(PendingWalletTransactionError)
  })
  await waitFor(() => expect(mocks.receipt).toHaveBeenCalled())
  expect(result.current.pending?.hash).toBe(hash)
  expect(readWalletTransaction(`314:${address}`)?.hash).toBe(hash)
  expect(result.current.error).toBeNull()
  mocks.receipt.mockResolvedValue({ status: 'success' })
  await act(async () => window.dispatchEvent(new Event('focus')))
  await waitFor(() => expect(result.current.pending).toBeNull())
  expect(confirmed).toHaveBeenCalledOnce()
  expect(mocks.wait).toHaveBeenCalledOnce()
  expect(readWalletTransaction(`314:${address}`)).toBeNull()
  expect(result.current.revision).toBe(1)
})

it('restores pending work after reload and isolates the selected network', async () => {
  const first = renderHook(() => useWalletTransaction(address, 'mainnet', false, reconcile, confirmed))
  await act(async () => {
    await expect(first.result.current.confirm(hash, 'deposit')).rejects.toThrow()
  })
  first.unmount()
  const second = renderHook(
    ({ network }: { network: 'mainnet' | 'calibration' }) =>
      useWalletTransaction(address, network, false, reconcile, confirmed),
    { initialProps: { network: 'calibration' } }
  )
  expect(second.result.current.pending).toBeNull()
  second.rerender({ network: 'mainnet' })
  await waitFor(() => expect(second.result.current.pending?.hash).toBe(hash))
  expect(mocks.wait).toHaveBeenCalledOnce()
})

it('clears a reverted transaction and allows an explicit new operation', async () => {
  mocks.wait.mockResolvedValue({ status: 'reverted' })
  const { result } = renderHook(() => useWalletTransaction(address, 'mainnet', false, reconcile, confirmed))
  await act(async () => {
    await expect(result.current.confirm(hash, 'deposit')).rejects.toThrow('reverted')
  })
  expect(result.current.pending).toBeNull()
  expect(result.current.error).toContain('reverted')
  expect(confirmed).not.toHaveBeenCalled()
})

it('recovers a replaced authorization from actual permissions without requiring the original receipt', async () => {
  const { result } = renderHook(() => useWalletTransaction(address, 'mainnet', false, reconcile, confirmed))
  await act(async () => {
    await expect(result.current.confirm(hash, 'authorize', 1234)).rejects.toThrow()
  })
  reconcile.mockResolvedValue(true)
  await act(async () => result.current.refresh())
  await waitFor(() => expect(result.current.pending).toBeNull())
  expect(confirmed).toHaveBeenCalledWith(expect.objectContaining({ kind: 'authorize', expiresAt: 1234 }))
})

it('stops automatic reads after ten minutes and still checks when the page resumes', async () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useWalletTransaction(address, 'mainnet', false, reconcile, confirmed))
  await act(async () => {
    await expect(result.current.confirm(hash, 'deposit')).rejects.toThrow()
  })
  await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000))
  const calls = mocks.receipt.mock.calls.length
  await act(async () => vi.advanceTimersByTimeAsync(5 * 60_000))
  expect(mocks.receipt).toHaveBeenCalledTimes(calls)
  await act(async () => window.dispatchEvent(new Event('focus')))
  expect(mocks.receipt).toHaveBeenCalledTimes(calls + 1)
  expect(result.current.pending?.hash).toBe(hash)
})

it('does not treat a wallet cancellation receipt as a successful payment', async () => {
  mocks.wait.mockImplementation(async ({ onReplaced }) => {
    onReplaced({ reason: 'cancelled', transaction: { hash } })
    return { status: 'success' }
  })
  const { result } = renderHook(() => useWalletTransaction(address, 'mainnet', false, reconcile, confirmed))
  await act(async () => {
    await expect(result.current.confirm(hash, 'deposit')).rejects.toThrow('cancelled')
  })
  expect(result.current.pending).toBeNull()
  expect(confirmed).not.toHaveBeenCalled()
})
