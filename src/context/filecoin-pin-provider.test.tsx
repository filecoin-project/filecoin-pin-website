import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useContext } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connection: { address: '0x1111111111111111111111111111111111111111', network: 'mainnet', session: null },
  snapshot: vi.fn(),
  account: vi.fn(),
}))
vi.mock('./browser-wallet-provider.tsx', () => ({ useBrowserWallet: () => mocks.connection }))
vi.mock('../lib/filecoin-pin/browser-wallet.ts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  browserSynapse: (address: string, network: string) => ({
    synapse: { address, network, payments: { accountSummary: () => mocks.account({ address, network }) } },
    validate: vi.fn(),
    encryptionReady: () => false,
  }),
}))
vi.mock('../lib/filecoin-pin/storage-chain.ts', () => ({ resolveStorageChain: vi.fn(async (chain) => chain) }))
vi.mock('../lib/filecoin-pin/wallet.ts', async (original) => ({
  ...(await original<object>()),
  fetchWalletSnapshot: mocks.snapshot,
}))
vi.mock('filecoin-pin/core/payments', () => ({
  checkAllowances: vi.fn(async () => ({ needsUpdate: false })),
  validateGasRequirement: vi.fn(() => ({ isValid: true })),
}))
vi.mock('../hooks/use-data-set-manager.ts', () => ({
  useDataSetManager: () => ({ dataSet: { status: 'idle' }, checkIfDatasetExists: vi.fn(), addDataSetId: vi.fn() }),
}))

import { resolveStorageChain } from '../lib/filecoin-pin/storage-chain.ts'
import { FilecoinPinContext, FilecoinPinProvider } from './filecoin-pin-provider.tsx'

beforeEach(() => {
  mocks.connection.network = 'mainnet'
  mocks.snapshot.mockReset()
  mocks.account.mockReset().mockResolvedValue({
    availableFunds: 1n,
    debt: 0n,
    lockupRatePerEpoch: 0n,
    runwayInEpochs: 0n,
  })
  localStorage.clear()
})

it.each(['resolve', 'reject'])('ignores a stale wallet read that later %ss after a network switch', async (outcome) => {
  let resolveOld!: (value: unknown) => void
  let rejectOld!: (error: Error) => void
  const snapshot = (network: string) => ({
    address: mocks.connection.address,
    network,
    filBalance: 1n,
    raw: { filecoinPayBalance: 1n },
  })
  mocks.snapshot.mockImplementation(({ network }) =>
    network === 'mainnet'
      ? new Promise((resolve, reject) => {
          resolveOld = resolve
          rejectOld = reject
        })
      : Promise.resolve(snapshot(network))
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result, rerender } = renderHook(() => useContext(FilecoinPinContext), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <FilecoinPinProvider>{children}</FilecoinPinProvider>
      </QueryClientProvider>
    ),
  })
  await waitFor(() => expect(mocks.snapshot).toHaveBeenCalledTimes(1))
  mocks.connection.network = 'calibration'
  rerender()
  await waitFor(() => expect(result.current?.wallet.data?.network).toBe('calibration'))
  await act(async () => {
    if (outcome === 'resolve') resolveOld(snapshot('mainnet'))
    else rejectOld(new Error('Stale RPC failure'))
  })
  expect(result.current?.wallet.status).toBe('ready')
  expect(result.current?.wallet.data?.network).toBe('calibration')
  expect(result.current?.storageSetup?.status).toBe('ready')
})

it('does not render the previous wallet balance or readiness while another wallet loads', async () => {
  const alice = mocks.connection.address
  const bob = '0x2222222222222222222222222222222222222222'
  mocks.snapshot.mockImplementation(({ address }) =>
    address === alice
      ? Promise.resolve({ address, network: 'mainnet', filBalance: 1n, raw: { filecoinPayBalance: 1n } })
      : new Promise(() => {
          /* Keep the second wallet pending while checking rendered isolation. */
        })
  )
  const renders: { scope?: string; address?: string; funded?: boolean }[] = []
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result, rerender } = renderHook(
    () => {
      const value = useContext(FilecoinPinContext)
      renders.push({
        scope: value?.storageScope,
        address: value?.wallet.data?.address,
        funded: value?.storageSetup?.depositReady,
      })
      return value
    },
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <FilecoinPinProvider>{children}</FilecoinPinProvider>
        </QueryClientProvider>
      ),
    }
  )
  try {
    await waitFor(() => expect(result.current?.wallet.status).toBe('ready'))
    mocks.connection.address = bob
    rerender()
    expect(result.current?.wallet.data).toBeUndefined()
    expect(result.current?.storageSetup?.depositReady).toBe(false)
    expect(
      renders.filter((value) => value.scope?.endsWith(bob)).every((value) => !value.address && !value.funded)
    ).toBe(true)
  } finally {
    mocks.connection.address = alice
  }
})

it('keeps the current balance visible during a refresh and reports a failed refresh', async () => {
  const snapshot = {
    address: mocks.connection.address,
    network: 'mainnet',
    filBalance: 1n,
    raw: { filecoinPayBalance: 1n },
  }
  mocks.snapshot.mockResolvedValue(snapshot)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(() => useContext(FilecoinPinContext), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <FilecoinPinProvider>{children}</FilecoinPinProvider>
      </QueryClientProvider>
    ),
  })
  await waitFor(() => expect(result.current?.wallet.status).toBe('ready'))
  let fail!: (cause: Error) => void
  mocks.snapshot.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject
      })
  )
  const budgetKey = ['drive-storage-budget', result.current?.storageScope, 0, '1', '30']
  queryClient.setQueryData(budgetKey, { depositNeeded: 1n })
  let refresh!: Promise<void>
  await act(async () => {
    if (!result.current) throw new Error('Missing wallet context')
    refresh = result.current.refreshWallet()
  })
  expect(result.current?.wallet.status).toBe('ready')
  expect(result.current?.storageSetup?.status).toBe('ready')
  expect(queryClient.getQueryState(budgetKey)?.isInvalidated).toBe(true)
  expect(result.current?.wallet.data).toEqual(snapshot)
  await act(async () => {
    fail(new Error('RPC unavailable'))
    await refresh
  })
  await waitFor(() => expect(result.current?.wallet.status).toBe('error'))
  expect(result.current?.wallet.data).toEqual(snapshot)
  expect(result.current?.storageSetup?.status).toBe('error')
})

it('marks fully reserved deposits as needing funds before an upload is selected', async () => {
  mocks.snapshot.mockResolvedValue({
    address: mocks.connection.address,
    network: 'mainnet',
    filBalance: 1n,
    raw: { filecoinPayBalance: 10n ** 19n },
  })
  mocks.account.mockResolvedValue({ availableFunds: 0n, debt: 0n, lockupRatePerEpoch: 1n, runwayInEpochs: 0n })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(() => useContext(FilecoinPinContext), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <FilecoinPinProvider>{children}</FilecoinPinProvider>
      </QueryClientProvider>
    ),
  })
  await waitFor(() => expect(result.current?.wallet.status).toBe('ready'))
  expect(result.current?.wallet.data?.raw.filecoinPayBalance).toBe(10n ** 19n)
  expect(result.current?.storageSetup).toMatchObject({
    depositReady: false,
    fundsStatus: 'needed',
    approvalReady: true,
    status: 'blocked',
  })
})

it('blocks uploads when current runway is below the safety minimum', async () => {
  mocks.snapshot.mockResolvedValue({
    address: mocks.connection.address,
    network: 'mainnet',
    filBalance: 1n,
    raw: { filecoinPayBalance: 10n ** 19n },
  })
  mocks.account.mockResolvedValue({ availableFunds: 100n, debt: 0n, lockupRatePerEpoch: 1n, runwayInEpochs: 100n })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(() => useContext(FilecoinPinContext), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <FilecoinPinProvider>{children}</FilecoinPinProvider>
      </QueryClientProvider>
    ),
  })
  await waitFor(() => expect(result.current?.wallet.status).toBe('ready'))
  expect(result.current?.storageSetup).toMatchObject({ depositReady: false, fundsStatus: 'low', status: 'blocked' })
})

it('keeps setup unverified when the available-funds read fails', async () => {
  mocks.snapshot.mockResolvedValue({
    address: mocks.connection.address,
    network: 'mainnet',
    filBalance: 1n,
    raw: { filecoinPayBalance: 10n ** 19n },
  })
  mocks.account.mockRejectedValue(new Error('Account summary unavailable'))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(() => useContext(FilecoinPinContext), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <FilecoinPinProvider>{children}</FilecoinPinProvider>
      </QueryClientProvider>
    ),
  })
  await waitFor(() => expect(result.current?.wallet.status).toBe('error'))
  expect(result.current?.storageSetup).toMatchObject({ depositReady: false, status: 'error' })
})

it('rechecks an external withdrawal on focus even when cached data is fresh', async () => {
  mocks.snapshot.mockResolvedValue({
    address: mocks.connection.address,
    network: 'mainnet',
    filBalance: 1n,
    raw: { filecoinPayBalance: 10n ** 19n },
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const { result, unmount } = renderHook(() => useContext(FilecoinPinContext), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <FilecoinPinProvider>{children}</FilecoinPinProvider>
      </QueryClientProvider>
    ),
  })
  try {
    await waitFor(() => expect(result.current?.storageSetup?.status).toBe('ready'))
    mocks.account.mockResolvedValue({ availableFunds: 0n, debt: 0n, lockupRatePerEpoch: 1n, runwayInEpochs: 0n })
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await waitFor(() => expect(result.current?.storageSetup?.fundsStatus).toBe('needed'))
    expect(result.current?.storageSetup?.depositReady).toBe(false)
  } finally {
    unmount()
    queryClient.clear()
    focusManager.setFocused(undefined)
  }
})

it('retries missing chain configuration immediately and then loads balances', async () => {
  vi.mocked(resolveStorageChain).mockRejectedValueOnce(new Error('Configuration RPC unavailable'))
  mocks.snapshot.mockResolvedValue({
    address: mocks.connection.address,
    network: 'mainnet',
    filBalance: 1n,
    raw: { filecoinPayBalance: 1n },
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result, unmount } = renderHook(() => useContext(FilecoinPinContext), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <FilecoinPinProvider>{children}</FilecoinPinProvider>
      </QueryClientProvider>
    ),
  })
  try {
    await waitFor(() => expect(result.current?.storageSetup?.status).toBe('error'))
    expect(mocks.snapshot).not.toHaveBeenCalled()
    await act(async () => {
      await result.current?.refreshWallet()
    })
    await waitFor(() => expect(result.current?.storageSetup?.status).toBe('ready'))
    expect(mocks.snapshot).toHaveBeenCalledTimes(1)
    expect(result.current?.wallet.data?.network).toBe('mainnet')
  } finally {
    unmount()
    queryClient.clear()
  }
})
