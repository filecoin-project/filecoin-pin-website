import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type RenderHookOptions, renderHook as renderBaseHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { RpcRequestError } from 'viem'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  wait: vi.fn(),
  receipt: vi.fn(),
  request: vi.fn(),
}))
vi.mock('../lib/filecoin-pin/browser-wallet.ts', async (original) => ({
  ...(await original<typeof import('../lib/filecoin-pin/browser-wallet.ts')>()),
  publicClient: () => ({
    waitForTransactionReceipt: mocks.wait,
    getTransactionReceipt: mocks.receipt,
    request: mocks.request,
  }),
}))

import { readWalletTransaction, saveWalletTransaction } from '../lib/local-storage/wallet-transaction.ts'
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
  vi.resetAllMocks()
  mocks.wait.mockRejectedValue(new Error('timeout'))
  mocks.receipt.mockRejectedValue(new Error('receipt not found'))
  mocks.request.mockResolvedValue(null)
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

const messageCid = 'bafy2bzacea3wsdh6y3a36tb3skempjoxqpuyompjbmfeyf34fi3uy6uue42v4'
const executedCid = 'bafy2bzacebp3shtrn43k7g3unredz7fxn4gj533d3o43tqn2p2ipxxhrvchve'

it.each(['deposit', 'approve'] as const)('recovers a sped-up %s after timeout and reload', async (kind) => {
  const replacementHash = `0x${'b'.repeat(64)}` as const
  mocks.request.mockImplementation(async ({ method }) =>
    method === 'Filecoin.EthGetMessageCidByTransactionHash' ? { '/': messageCid } : null
  )
  const first = renderHook(() => useWalletTransaction(address, 'mainnet', false, reconcile, confirmed))
  await act(async () => {
    await expect(first.result.current.confirm(hash, kind)).rejects.toBeInstanceOf(PendingWalletTransactionError)
  })
  expect(readWalletTransaction(`314:${address}`)?.messageCid).toBe(messageCid)
  first.unmount()
  // The old hash is no longer available. The saved CID still identifies a repriced message.
  mocks.request.mockClear()
  mocks.request.mockImplementation(async ({ method }) => {
    if (method === 'Filecoin.StateSearchMsg') return { Message: { '/': executedCid }, Receipt: { ExitCode: 0 } }
    if (method === 'Filecoin.EthGetTransactionHashByCid') return replacementHash
    throw new Error('The original hash is gone')
  })
  const second = renderHook(() => useWalletTransaction(address, 'mainnet', false, reconcile, confirmed))
  await waitFor(() => expect(confirmed).toHaveBeenCalledWith(expect.objectContaining({ hash: replacementHash, kind })))
  expect(second.result.current.pending).toBeNull()
  expect(readWalletTransaction(`314:${address}`)).toBeNull()
  expect(mocks.wait).toHaveBeenCalledOnce()
  expect(mocks.request.mock.calls.map(([request]) => request.method)).not.toContain(
    'Filecoin.EthGetMessageCidByTransactionHash'
  )
})

it('clears an explicit cancellation found after timeout without reporting a successful deposit', async () => {
  mocks.request.mockImplementation(async ({ method }) =>
    method === 'Filecoin.EthGetMessageCidByTransactionHash' ? { '/': messageCid } : null
  )
  const { result } = renderHook(() => useWalletTransaction(address, 'mainnet', false, reconcile, confirmed))
  await act(async () => {
    await expect(result.current.confirm(hash, 'deposit')).rejects.toThrow()
  })
  mocks.request.mockRejectedValue(
    new RpcRequestError({
      body: {},
      url: 'https://rpc.test',
      error: {
        code: 1,
        message:
          'message was replaced: found message with equal nonce as the one we are looking for that is NOT a valid replacement message (F:old n 7, TS:new n7)',
      },
    })
  )
  await act(async () => result.current.refresh())
  await waitFor(() => expect(result.current.pending).toBeNull())
  expect(result.current.error).toContain('cancelled or replaced')
  expect(confirmed).not.toHaveBeenCalled()
})

it('preserves pending work when Lotus becomes unavailable and recovers when it returns', async () => {
  mocks.request.mockResolvedValue({ '/': messageCid })
  const first = renderHook(() => useWalletTransaction(address, 'mainnet', true, reconcile, confirmed))
  await act(async () => {
    await expect(first.result.current.confirm(hash, 'deposit')).rejects.toThrow()
  })
  first.unmount()
  mocks.request.mockRejectedValue(new Error('Lotus method unavailable'))
  const second = renderHook(() => useWalletTransaction(address, 'mainnet', false, reconcile, confirmed))
  await waitFor(() => expect(mocks.receipt).toHaveBeenCalled())
  expect(second.result.current.pending?.hash).toBe(hash)
  expect(readWalletTransaction(`314:${address}`)?.messageCid).toBe(messageCid)
  expect(confirmed).not.toHaveBeenCalled()
  mocks.request.mockResolvedValue({ Message: { '/': messageCid }, Receipt: { ExitCode: 0 } })
  await act(async () => second.result.current.refresh())
  await waitFor(() => expect(second.result.current.pending).toBeNull())
  expect(confirmed).toHaveBeenCalledOnce()
})

it('does not discard another tab’s newer pending transaction when an older receipt resolves', async () => {
  let settle!: (receipt: { status: string }) => void
  mocks.wait.mockImplementation(
    () =>
      new Promise((resolve) => {
        settle = resolve
      })
  )
  const { result } = renderHook(() => useWalletTransaction(address, 'mainnet', true, reconcile, confirmed))
  let operation!: Promise<void>
  act(() => {
    operation = result.current.confirm(hash, 'deposit')
  })
  await waitFor(() => expect(mocks.wait).toHaveBeenCalledOnce())
  const newer = { hash: `0x${'b'.repeat(64)}` as const, kind: 'approve' as const, submittedAt: Date.now() }
  saveWalletTransaction(`314:${address}`, newer)
  await act(async () => {
    settle({ status: 'success' })
    await operation
  })
  expect(readWalletTransaction(`314:${address}`)).toEqual(newer)
  expect(result.current.pending).toBeNull()
})
