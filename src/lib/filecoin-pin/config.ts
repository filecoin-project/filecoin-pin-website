import type { SynapseSetupConfig } from 'filecoin-pin/core/synapse'

const normalizeEnvValue = (value: string | boolean | number | undefined) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

if (!import.meta.env.VITE_FILECOIN_PRIVATE_KEY) {
  throw new Error('Missing VITE_FILECOIN_PRIVATE_KEY; unable to initialize Synapse')
}

export const filecoinPinConfig: SynapseSetupConfig = {
  privateKey: import.meta.env.VITE_FILECOIN_PRIVATE_KEY,
  rpcUrl: normalizeEnvValue(import.meta.env.VITE_FILECOIN_RPC_URL),
  warmStorageAddress: normalizeEnvValue(import.meta.env.VITE_WARM_STORAGE_ADDRESS),
}
