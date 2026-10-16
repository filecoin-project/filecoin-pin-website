import { act, renderHook, waitFor } from '@testing-library/react'
import { useContext } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connection: { address: '0x1111111111111111111111111111111111111111', network: 'mainnet', session: null },
  snapshot: vi.fn(),
}))
vi.mock('./browser-wallet-provider.tsx', () => ({ useBrowserWallet: () => mocks.connection }))
vi.mock('../lib/filecoin-pin/browser-wallet.ts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  browserSynapse: (address: string, network: string) => ({ synapse: { address, network }, validate: vi.fn() }),
}))
vi.mock('../lib/filecoin-pin/storage-chain.ts', () => ({ resolveStorageChain: vi.fn(async (chain) => chain) }))
vi.mock('../lib/filecoin-pin/wallet.ts', () => ({ fetchWalletSnapshot: mocks.snapshot }))
vi.mock('filecoin-pin/core/payments', () => ({
  checkAllowances: vi.fn(async () => ({ needsUpdate: false })),
  validateGasRequirement: vi.fn(() => ({ isValid: true })),
}))
vi.mock('../hooks/use-data-set-manager.ts', () => ({
  useDataSetManager: () => ({ dataSet: { status: 'idle' }, checkIfDatasetExists: vi.fn(), addDataSetId: vi.fn() }),
}))

import { FilecoinPinContext, FilecoinPinProvider } from './filecoin-pin-provider.tsx'

beforeEach(() => {
  mocks.connection.network = 'mainnet'
  mocks.snapshot.mockReset()
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
  const { result, rerender } = renderHook(() => useContext(FilecoinPinContext), { wrapper: FilecoinPinProvider })
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
