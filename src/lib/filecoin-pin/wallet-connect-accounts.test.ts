import { afterEach, expect, it, vi } from 'vitest'
import type { WalletConnectProvider } from './wallet-connect.ts'
import { readWalletConnectAccount } from './wallet-connect-accounts.ts'

const address = '0x1111111111111111111111111111111111111111'
afterEach(() => vi.useRealTimers())
it('accepts a chain-approved session account when the provider account cache is empty', async () => {
  const provider = {
    request: vi.fn().mockResolvedValue([]),
    session: { namespaces: { eip155: { accounts: [`eip155:314159:${address}`] } } },
  } as unknown as WalletConnectProvider
  expect(await readWalletConnectAccount(provider, 'calibration')).toBe(address)
})
it('waits for the mobile account update without requesting another authorization', async () => {
  vi.useFakeTimers()
  const request = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([address])
  const result = readWalletConnectAccount({ request } as unknown as WalletConnectProvider, 'calibration')
  await vi.advanceTimersByTimeAsync(250)
  expect(await result).toBe(address)
  expect(request).toHaveBeenNthCalledWith(2, { method: 'eth_accounts' })
})
it('does not treat an account approved only on Ethereum mainnet as a Calibration account', async () => {
  vi.useFakeTimers()
  const provider = {
    request: vi.fn().mockResolvedValue([]),
    session: { namespaces: { eip155: { accounts: [`eip155:1:${address}`] } } },
  } as unknown as WalletConnectProvider
  const result = expect(readWalletConnectAccount(provider, 'calibration')).rejects.toThrow(
    'Add and enable this network'
  )
  await vi.runAllTimersAsync()
  await result
})
it('preserves rejected RPC requests instead of falling back to a cached account', async () => {
  const provider = {
    request: vi.fn().mockRejectedValue(new Error('User rejected request')),
  } as unknown as WalletConnectProvider
  await expect(readWalletConnectAccount(provider, 'mainnet')).rejects.toThrow('User rejected')
})
