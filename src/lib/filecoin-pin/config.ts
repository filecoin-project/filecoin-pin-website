import type { SynapseSetupConfig } from 'filecoin-pin/core/synapse'
import type { Hex } from 'viem'

const normalizeEnvValue = (value: string | boolean | number | undefined) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

// Hardcoded defaults (can be overridden by env vars) expires: 2026-02-01 16:37:53
const DEFAULT_WALLET_ADDRESS: Hex = '0x44f08D1beFe61255b3C3A349C392C560FA333759'
const DEFAULT_SESSION_KEY: Hex = '0xca3c92749c4c31beb64ea4334a719b813af1b54b8449a12c81d583018a252af8'

const privateKey = normalizeEnvValue(import.meta.env.VITE_FILECOIN_PRIVATE_KEY) as Hex | undefined
const walletAddress = (normalizeEnvValue(import.meta.env.VITE_WALLET_ADDRESS) ?? DEFAULT_WALLET_ADDRESS) as Hex
const sessionKey = (normalizeEnvValue(import.meta.env.VITE_SESSION_KEY) ?? DEFAULT_SESSION_KEY) as Hex

const hasStandardAuth = privateKey != null
const hasSessionKeyAuth = walletAddress != null && sessionKey != null

if (hasStandardAuth && hasSessionKeyAuth) {
  throw new Error(
    'Conflicting authentication: provide either VITE_FILECOIN_PRIVATE_KEY or (VITE_WALLET_ADDRESS + VITE_SESSION_KEY), not both'
  )
}

export const filecoinPinConfig: SynapseSetupConfig = privateKey
  ? { privateKey, rpcUrl: normalizeEnvValue(import.meta.env.VITE_FILECOIN_RPC_URL) }
  : {
      walletAddress,
      sessionKey,
      rpcUrl: normalizeEnvValue(import.meta.env.VITE_FILECOIN_RPC_URL),
    }
