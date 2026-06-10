/**
 * Direct provider selection for a browser's first upload.
 *
 * The SDK's smart-select looks for an existing metadata-matching dataset by
 * enumerating every dataset the wallet owns (one eth_call per dataset). On the
 * shared demo wallet that is unbounded: the wallet gains one dataset per new
 * visitor, so the enumeration grows without limit.
 *
 * A browser with no stored dataset ids is known to have no matching dataset,
 * so the search is pointless. This module selects providers straight from the
 * registry (two RPC calls total) and builds StorageContexts with no dataset
 * bound; the provider creates the dataset during the upload commit
 * (CreateDataSetAndAddPieces), exactly as it would after smart-select chose a
 * provider without a matching dataset.
 */

import { getEndorsedProviderIds } from '@filoz/synapse-core/endorsements'
import { ping } from '@filoz/synapse-core/sp'
import { getApprovedPDPProviders } from '@filoz/synapse-core/sp-registry'
import { selectProviders } from '@filoz/synapse-core/warm-storage'
import { METADATA_KEYS } from '@filoz/synapse-sdk'
import { StorageContext } from '@filoz/synapse-sdk/storage'
import { WarmStorageService } from '@filoz/synapse-sdk/warm-storage'
import { filecoinPinConfig } from './config.ts'
import { APPLICATION_SOURCE, type Synapse } from './synapse.ts'

const DEFAULT_COPIES = 2

const withCDN = ('withCDN' in filecoinPinConfig ? filecoinPinConfig.withCDN : false) ?? false

/**
 * Select reachable providers (endorsed preferred for the primary copy) and
 * return upload-ready contexts that create a fresh dataset on commit.
 *
 * The dataset metadata matches what the smart-select path would have used, so
 * datasets created here are interchangeable with SDK-created ones.
 *
 * @throws When no reachable provider is available for the primary copy.
 */
export async function createFreshUploadContexts(
  synapse: Synapse,
  clientId: string,
  copies = DEFAULT_COPIES
): Promise<StorageContext[]> {
  const [providers, endorsedIds] = await Promise.all([
    getApprovedPDPProviders(synapse.client),
    getEndorsedProviderIds(synapse.client),
  ])

  const dataSetMetadata: Record<string, string> = {
    [METADATA_KEYS.WITH_IPFS_INDEXING]: '',
    [METADATA_KEYS.SOURCE]: APPLICATION_SOURCE,
    clientId,
  }

  const excludeProviderIds: bigint[] = []
  const selected = []
  for (let i = 0; i < copies; i++) {
    // Restrict the primary copy to endorsed providers, mirroring the SDK's
    // requireEndorsedPrimary behavior; secondaries draw from the full pool.
    const endorsedSlot = i === 0
    let found = false
    while (!found) {
      const candidates = selectProviders({
        providers,
        endorsedIds: endorsedSlot ? endorsedIds : [],
        clientDataSets: [],
        count: 1,
        excludeProviderIds,
        metadata: dataSetMetadata,
      })
      const candidate = candidates[0]
      if (candidate == null) break
      excludeProviderIds.push(candidate.provider.id)
      try {
        await ping(candidate.provider.pdp.serviceURL)
        selected.push(candidate.provider)
        found = true
      } catch {
        console.warn('[FreshContexts] Provider unreachable, trying next:', candidate.provider.name)
      }
    }
    if (!found) {
      if (i === 0) {
        throw new Error('No reachable storage providers available')
      }
      // Fewer providers than requested copies: proceed with reduced redundancy
      console.warn('[FreshContexts] Only', selected.length, 'reachable provider(s) for', copies, 'copies')
      break
    }
  }

  const warmStorageService = new WarmStorageService({ client: synapse.client })
  return selected.map(
    (provider) =>
      new StorageContext({
        synapse,
        warmStorageService,
        provider,
        dataSetId: undefined,
        options: { withCDN },
        dataSetMetadata,
      })
  )
}
