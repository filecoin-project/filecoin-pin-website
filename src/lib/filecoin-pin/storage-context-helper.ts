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
import { DEFAULT_DATA_SET_METADATA, DEFAULT_STORAGE_CONTEXT_CONFIG } from 'filecoin-pin/core/synapse'
import pino from 'pino'

const logger = pino({
  level: 'debug',
  browser: {
    asObject: true,
  },
})

export type StorageContextHelperResult = {
  storage: StorageContext
  providerInfo: ProviderInfo
}

/**
 * Create a StorageContext for an existing dataSetId without scanning all datasets.
 */
export async function createStorageContextFromDataSetId(
  synapse: Synapse,
  dataSetId: number
): Promise<StorageContextHelperResult> {
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

  const activeProvider = validateProvider(providerInfo, dataSetInfo.providerId)

  // Construct storage context directly
  const withCDN = dataSetInfo.cdnRailId > 0
  const storageContext = new StorageContext(
    synapse,
    warmStorage,
    activeProvider,
    dataSetId,
    { withCDN },
    dataSetMetadata
  )

  return {
    storage: storageContext,
    providerInfo: activeProvider,
  }
}

export type CreateNewStorageContextOptions = {
  providerId?: number
  providerAddress?: string
}

/**
 * Create a StorageContext configured for creating a brand new dataset without scanning all
 * existing datasets. Provider selection favors explicit overrides and otherwise picks the
 * first active provider that exposes a PDP endpoint.
 */
export async function createStorageContextForNewDataSet(
  synapse: Synapse,
  options: CreateNewStorageContextOptions = {}
): Promise<StorageContextHelperResult> {
  // @ts-expect-error - Accessing private _warmStorageService temporarily until SDK is updated
  const warmStorage = synapse.storage._warmStorageService
  if (!warmStorage) {
    throw new Error('WarmStorageService not available on Synapse instance')
  }

  const registryAddress = warmStorage.getServiceProviderRegistryAddress()
  const spRegistry = new SPRegistryService(synapse.getProvider(), registryAddress)

  let providerInfo: ProviderInfo | null = null
  if (options.providerId != null) {
    providerInfo = validateProvider(await spRegistry.getProvider(options.providerId), options.providerId)
  } else if (options.providerAddress) {
    providerInfo = validateProvider(await spRegistry.getProviderByAddress(options.providerAddress))
  }

  if (providerInfo == null) {
    const providers = await spRegistry.getAllActiveProviders()
    providerInfo = providers.find((provider) => isProviderUsable(provider)) ?? null
    if (providerInfo == null) {
      throw new Error('Unable to resolve an approved storage provider for new data set creation')
    }
  }

  if (providerInfo == null) {
    throw new Error('Unable to resolve an approved storage provider for new data set creation')
  }

  const mergedMetadata = { ...DEFAULT_DATA_SET_METADATA }

  const storageOptions = {
    ...DEFAULT_STORAGE_CONTEXT_CONFIG,
    metadata: mergedMetadata,
  }

  const storageContext = new StorageContext(
    synapse,
    warmStorage,
    providerInfo,
    undefined,
    storageOptions,
    mergedMetadata
  )

  return {
    storage: storageContext,
    providerInfo,
  }
}

function validateProvider(providerInfo: ProviderInfo | null, providerId?: number): ProviderInfo {
  if (providerInfo == null) {
    throw new Error(
      providerId != null ? `Provider ID ${providerId} not found in registry` : 'Provider not found in registry'
    )
  }

  if (!isProviderUsable(providerInfo)) {
    logger.debug({ providerInfo }, 'Provider not usable')
    const providerLabel =
      (providerInfo as ProviderInfo)?.name ?? (providerInfo as ProviderInfo)?.id ?? providerId ?? 'unknown'
    throw new Error(`Provider ${providerLabel} is not active or does not expose an active PDP endpoint`)
  }

  logger.debug({ providerInfo }, 'Provider validated')

  return providerInfo
}

function isProviderUsable(providerInfo: ProviderInfo | null): providerInfo is ProviderInfo {
  if (!providerInfo) return false
  const pdpProduct = providerInfo.products.PDP
  return (
    providerInfo.active === true &&
    pdpProduct?.isActive === true &&
    typeof pdpProduct.data?.serviceURL === 'string' &&
    pdpProduct.data.serviceURL.length > 0
  )
}

export default createStorageContextFromDataSetId
