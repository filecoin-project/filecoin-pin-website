import { calibration, mainnet } from '@filoz/synapse-sdk'
import { zeroAddress } from 'viem'
import { beforeEach, expect, it, vi } from 'vitest'
import { resolveProviderExplorerLink } from './provider-explorer.ts'

const { read } = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('./browser-wallet.ts', async (original) => ({
  ...(await original<typeof import('./browser-wallet.ts')>()),
  publicClient: () => ({ readContract: read }),
}))
const address = '0xCb9e86945cA31E6C3120725BF0385CBAD684040c'
beforeEach(() => {
  read.mockReset()
})
it.each([
  ['calibration', calibration],
  ['mainnet', mainnet],
] as const)('links the registered provider address on %s', async (network, chain) => {
  read.mockResolvedValue({ info: { serviceProvider: address } })
  expect(await resolveProviderExplorerLink('4', network)).toBe(
    `https://pdp.filecoin.cloud/${network}/providers/${address}`
  )
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({ address: chain.contracts.serviceProviderRegistry.address, args: [4n] })
  )
})
it('does not generate an invalid numeric provider URL when RPC fails', async () => {
  read.mockRejectedValue(new Error('RPC unavailable'))
  await expect(resolveProviderExplorerLink('4', 'calibration')).rejects.toThrow('RPC unavailable')
})
it('does not link an unregistered provider', async () => {
  read.mockResolvedValue({ info: { serviceProvider: zeroAddress } })
  await expect(resolveProviderExplorerLink('4', 'calibration')).rejects.toThrow('unavailable')
})
