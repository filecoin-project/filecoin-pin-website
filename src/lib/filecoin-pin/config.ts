import type { SynapseSetupConfig } from 'filecoin-pin/core/synapse'

const normalizeEnvValue = (value: string | boolean | number | undefined) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

const privateKey = normalizeEnvValue(import.meta.env.VITE_FILECOIN_PRIVATE_KEY)
const walletAddress = normalizeEnvValue(import.meta.env.VITE_WALLET_ADDRESS)
const sessionKey = normalizeEnvValue(import.meta.env.VITE_SESSION_KEY)

const hasStandardAuth = privateKey != null
const hasSessionKeyAuth = walletAddress != null && sessionKey != null

if (!hasStandardAuth && !hasSessionKeyAuth) {
  throw new Error('Authentication required: provide either VITE_FILECOIN_PRIVATE_KEY or (VITE_WALLET_ADDRESS + VITE_SESSION_KEY)')
}

if (hasStandardAuth && hasSessionKeyAuth) {
  throw new Error('Conflicting authentication: provide either VITE_FILECOIN_PRIVATE_KEY or (VITE_WALLET_ADDRESS + VITE_SESSION_KEY), not both')
}

export const filecoinPinConfig: SynapseSetupConfig = {
  privateKey: privateKey,
  walletAddress: walletAddress,
  sessionKey: sessionKey,
  rpcUrl: normalizeEnvValue(import.meta.env.VITE_FILECOIN_RPC_URL),
  warmStorageAddress: normalizeEnvValue(import.meta.env.VITE_WARM_STORAGE_ADDRESS),
}
