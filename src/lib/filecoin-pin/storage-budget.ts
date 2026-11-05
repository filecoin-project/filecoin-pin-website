import type { Synapse } from '@filoz/synapse-sdk'
import { getStoredDataSetIds } from '../local-storage/data-set.ts'
import { storageBudgetBytes, storageBudgetEpochs, storageBudgetInputError } from './storage-budget-input.ts'
import { resolveUploadContexts } from './upload-funding.ts'

/** Read-only estimate; account-level runway is applied once across both copies. */
export async function quoteStorageBudget(
  synapse: Synapse,
  scope: string,
  capacityGiB: string | number,
  days: string | number
) {
  const error = storageBudgetInputError(capacityGiB, days)
  if (error) throw new Error(error)
  const contexts = await resolveUploadContexts(synapse, { dataSetIds: getStoredDataSetIds(scope).map(BigInt) })
  const [result, account] = await Promise.all([
    synapse.storage.prepare({
      context: contexts,
      pieceSizes: [storageBudgetBytes(capacityGiB)],
      extraRunwayEpochs: storageBudgetEpochs(days),
    }),
    synapse.payments.accountSummary(),
  ])
  return { costs: result.costs, account, copies: contexts.length }
}
