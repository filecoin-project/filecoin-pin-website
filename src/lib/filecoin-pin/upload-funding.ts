import { METADATA_KEYS, type Synapse } from '@filoz/synapse-sdk'
import type { UploadExecutionOptions } from 'filecoin-pin/core/upload'
import { formatUnits } from 'viem'
import { getOrCreateClientId } from '../local-storage/client-id.ts'
import { DEFAULT_STORAGE_COPIES } from './config.ts'
import { createFreshUploadContexts } from './fresh-contexts.ts'
import { assertCurrentStorageChain } from './storage-chain.ts'
import { APPLICATION_SOURCE } from './synapse.ts'

export async function prepareUploadContexts(
  synapse: Synapse,
  dataSize: bigint,
  options: Pick<UploadExecutionOptions, 'contexts' | 'dataSetIds' | 'providerIds' | 'metadata'>
) {
  await assertCurrentStorageChain(synapse)
  let contexts = options.contexts
  if (!contexts && options.dataSetIds) {
    // Resolve individually: old and new datasets may share a provider, which
    // SDK batch resolution rejects before we can filter their metadata.
    const resolved = await Promise.all(
      [...new Set(options.dataSetIds)].map((id) => synapse.storage.createContexts({ withCDN: false, dataSetIds: [id] }))
    )
    const providers = new Set<bigint>()
    contexts = resolved.flat().filter((context) => {
      if (context.dataSetMetadata[METADATA_KEYS.SOURCE] !== APPLICATION_SOURCE || providers.has(context.provider.id))
        return false
      providers.add(context.provider.id)
      return true
    })
  }
  contexts ??= await synapse.storage.createContexts({
    withCDN: false,
    providerIds: options.providerIds,
    metadata: {
      [METADATA_KEYS.WITH_IPFS_INDEXING]: '',
      ...options.metadata,
      [METADATA_KEYS.SOURCE]: APPLICATION_SOURCE,
    },
  })
  // A previous partial upload may have saved only one dataset. Reuse it, but
  // select the missing provider before quoting this new upload's full cost.
  if (options.dataSetIds && contexts.length < DEFAULT_STORAGE_COPIES) {
    const additional = await createFreshUploadContexts(
      synapse,
      getOrCreateClientId(),
      DEFAULT_STORAGE_COPIES - contexts.length,
      contexts.map((context) => context.provider.id)
    )
    contexts = [...contexts, ...additional]
  }
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
