import { isAddressEqual, zeroAddress } from 'viem'
import { getProviderExplorerLink } from '../../utils/links.ts'
import { chains, type DriveNetwork, publicClient } from './browser-wallet.ts'

export async function resolveProviderExplorerLink(providerId: string, network: DriveNetwork) {
  const provider = await publicClient(network).readContract({
    ...chains[network].contracts.serviceProviderRegistry,
    functionName: 'getProvider',
    args: [BigInt(providerId)],
  })
  const address = provider.info.serviceProvider
  if (isAddressEqual(address, zeroAddress)) throw new Error('Provider address is unavailable')
  // PDP Explorer identifies providers by address, not the registry's numeric ID.
  return getProviderExplorerLink(address, network)
}
