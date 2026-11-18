import type { Synapse } from '@filoz/synapse-sdk'
import { checkFILBalance, validateGasRequirement } from 'filecoin-pin/core/payments'
import { UploadSetupError } from '../../utils/upload/upload-readiness.ts'
import { getOrCreateClientId } from '../local-storage/client-id.ts'
import { getStoredDataSetIds } from '../local-storage/data-set.ts'
import { DEFAULT_STORAGE_COPIES } from './config.ts'
import { createFreshUploadContexts } from './fresh-contexts.ts'
import { prepareUploadContexts } from './upload-funding.ts'

/** Check current chain state before persisting tasks or reading source bytes. */
export async function preflightUpload(
  synapse: Synapse,
  options: {
    storageScope: string
    providerId: bigint | null
    metadata: Record<string, string>
    sourceSizes: number[]
    ensurePermissions: () => Promise<void>
  }
) {
  await options.ensurePermissions()
  const gas = await checkFILBalance(synapse)
  const gasCheck = validateGasRequirement(gas.balance, gas.isCalibnet)
  if (!gasCheck.isValid)
    throw new UploadSetupError('gas', gasCheck.errorMessage ?? 'Insufficient FIL for transaction fees.')

  const metadata = { clientId: getOrCreateClientId(), ...options.metadata }
  // Source sizes are a lower bound: packing and encryption add bytes. A fresh
  // exact-size quote still runs for each task immediately before transfer.
  const sizes = options.sourceSizes.map((size) => BigInt(Math.max(1, size)))
  if (options.providerId != null)
    return prepareUploadContexts(synapse, sizes, { providerIds: [options.providerId], metadata })

  const ids = getStoredDataSetIds(options.storageScope)
  if (ids.length) return prepareUploadContexts(synapse, sizes, { dataSetIds: ids.map(BigInt), metadata })

  // Match the upload's fresh-provider path, including its read-only fallback.
  let contexts: Awaited<ReturnType<typeof createFreshUploadContexts>> | undefined
  try {
    contexts = await createFreshUploadContexts(synapse, metadata.clientId, DEFAULT_STORAGE_COPIES, [], metadata)
  } catch {
    // Selection may fail while the SDK's smart selection can still succeed.
  }
  return prepareUploadContexts(synapse, sizes, { contexts, metadata })
}
