import type { FilecoinChain } from '@filoz/synapse-core/chains'
import type { Synapse } from '@filoz/synapse-sdk'
import { type Chain, type Client, createPublicClient, http, isAddressEqual, type Transport, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'

/** SDK snapshots can lag a service upgrade. Resolve its active read contract. */
export async function resolveStorageChain(
  chain: FilecoinChain,
  client: Client<Transport, Chain> = createPublicClient({ chain, transport: http() })
): Promise<FilecoinChain> {
  const address = await readContract(client, {
    ...chain.contracts.fwss,
    functionName: 'viewContractAddress',
  })
  if (isAddressEqual(address, zeroAddress)) throw new Error('Storage configuration is unavailable on this network.')
  const service = await readContract(client, {
    address,
    abi: chain.contracts.fwssView.abi,
    functionName: 'service',
  })
  if (!isAddressEqual(service, chain.contracts.fwss.address))
    throw new Error('The storage read contract does not match this network. File operations are paused.')
  return {
    ...chain,
    contracts: { ...chain.contracts, fwssView: { ...chain.contracts.fwssView, address } },
  }
}

/** A service upgrade during an open session must not use stale pricing. */
export async function assertCurrentStorageChain(synapse: Synapse) {
  const address = await readContract(synapse.readClient, {
    ...synapse.chain.contracts.fwss,
    functionName: 'viewContractAddress',
  })
  if (!isAddressEqual(address, synapse.chain.contracts.fwssView.address))
    throw new Error('Storage configuration changed on this network. Reload this page before uploading.')
}
