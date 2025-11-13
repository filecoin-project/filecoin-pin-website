/**
 * Helper: createStorageContextFromDataSetId
 *
 * Optimized helper to create a StorageContext for an existing dataset ID without
 * triggering the expensive "scan all client datasets" hotpath.
 *
 * This is a workaround for https://github.com/FilOzone/synapse-sdk/issues/435
 * until https://github.com/FilOzone/synapse-sdk/pull/438 is merged and published.
 *
 * Benefits:
 *  - Reuses Synapse's existing WarmStorageService (no extra initialization)
 *  - Only fetches data for the single dataset needed (~5-6 RPC calls vs 1500+)
 *  - Validates ownership, isLive, and isManaged
 *
 * TODO: Replace with synapse.storage.createContextFromDataSetId() once PR #438 is published
 */

import type { Synapse } from '@filoz/synapse-sdk'
import { StorageContext } from '@filoz/synapse-sdk'
import { type ProviderInfo, SPRegistryService } from '@filoz/synapse-sdk/sp-registry'

export type CreateStorageContextFromDataSetIdResult = {
  storage: StorageContext
  providerInfo: ProviderInfo
}

/**
 * Create a StorageContext for an existing dataSetId without scanning all datasets.
 */
export async function createStorageContextFromDataSetId(
  synapse: Synapse,
  dataSetId: number
): Promise<CreateStorageContextFromDataSetIdResult> {
  // Access Synapse's internal WarmStorageService (avoids creating a new one)
  // @ts-expect-error - Accessing private _warmStorageService temporarily until SDK is updated
  const warmStorage = synapse.storage._warmStorageService
  if (!warmStorage) {
    throw new Error('WarmStorageService not available on Synapse instance')
  }

  // Get basic dataset info and validate in parallel
  const [dataSetInfo] = await Promise.all([warmStorage.getDataSet(dataSetId), warmStorage.validateDataSet(dataSetId)])

  // Verify ownership
  const signerAddress = await synapse.getClient().getAddress()
  if (dataSetInfo.payer.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Data set ${dataSetId} is not owned by ${signerAddress} (owned by ${dataSetInfo.payer})`)
  }

  // Get provider info and metadata in parallel
  const registryAddress = warmStorage.getServiceProviderRegistryAddress()
  const spRegistry = new SPRegistryService(synapse.getProvider(), registryAddress)

  const [providerInfo, dataSetMetadata] = await Promise.all([
    spRegistry.getProvider(dataSetInfo.providerId),
    warmStorage.getDataSetMetadata(dataSetId),
  ])

  if (providerInfo == null) {
    throw new Error(`Provider ID ${dataSetInfo.providerId} for data set ${dataSetId} not found in registry`)
  }

  // Construct storage context directly
  const withCDN = dataSetInfo.cdnRailId > 0
  const storageContext = new StorageContext(synapse, warmStorage, providerInfo, dataSetId, { withCDN }, dataSetMetadata)

  return {
    storage: storageContext,
    providerInfo,
  }
}

export default createStorageContextFromDataSetId
