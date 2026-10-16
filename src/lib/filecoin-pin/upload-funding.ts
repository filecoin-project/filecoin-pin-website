import { METADATA_KEYS, type Synapse } from '@filoz/synapse-sdk'
import type { UploadExecutionOptions } from 'filecoin-pin/core/upload'
import { formatUnits } from 'viem'
import { assertCurrentStorageChain } from './storage-chain.ts'
import { APPLICATION_SOURCE } from './synapse.ts'

export async function prepareUploadContexts(
  synapse: Synapse,
  dataSize: bigint,
  options: Pick<UploadExecutionOptions, 'contexts' | 'dataSetIds' | 'providerIds' | 'metadata'>
) {
  await assertCurrentStorageChain(synapse)
  const contexts =
    options.contexts ??
    (await synapse.storage.createContexts({
      withCDN: false,
      ...(options.dataSetIds
        ? { dataSetIds: options.dataSetIds }
        : {
            providerIds: options.providerIds,
            metadata: {
              [METADATA_KEYS.WITH_IPFS_INDEXING]: '',
              [METADATA_KEYS.SOURCE]: APPLICATION_SOURCE,
              ...options.metadata,
            },
          }),
    }))
  if (!contexts.length) throw new Error('No storage providers available')
  // prepare is a read-only quote. Never execute its optional funding transaction:
  // deposits and owner approvals require the separate Wallet setup actions.
  const { costs } = await synapse.storage.prepare({ context: contexts, pieceSizes: [dataSize] })
  if (!costs.ready) {
    const issues: string[] = []
    if (costs.depositNeeded > 0n)
      issues.push(
        `Deposit at least ${formatUnits(costs.depositNeeded, 18)} more USDFC for these ${contexts.length} storage copies, including dataset fees and lockups.`
      )
    if (costs.needsFwssMaxApproval) issues.push('Approve storage payments in Wallet setup.')
    throw new Error(issues.join(' ') || 'Storage funding is not ready. Refresh Wallet setup and try again.')
  }
  return contexts
}
