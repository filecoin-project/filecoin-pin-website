import { RPC_URLS } from '@filoz/synapse-sdk'
import type { SynapseSetupConfig } from 'filecoin-pin/core/synapse'

const normalizeEnvValue = (value: string | boolean | number | undefined) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

// Hardcoded defaults (can be overridden by env vars) expires: 2026-02-01 16:37:53
const DEFAULT_WALLET_ADDRESS = '0x44f08D1beFe61255b3C3A349C392C560FA333759'
const DEFAULT_SESSION_KEY = '0xca3c92749c4c31beb64ea4334a719b813af1b54b8449a12c81d583018a252af8'

const privateKey = normalizeEnvValue(import.meta.env.VITE_FILECOIN_PRIVATE_KEY)
const walletAddress = normalizeEnvValue(import.meta.env.VITE_WALLET_ADDRESS) ?? DEFAULT_WALLET_ADDRESS
const sessionKey = normalizeEnvValue(import.meta.env.VITE_SESSION_KEY) ?? DEFAULT_SESSION_KEY

const hasStandardAuth = privateKey != null
const hasSessionKeyAuth = walletAddress != null && sessionKey != null

if (!hasStandardAuth && !hasSessionKeyAuth) {
  throw new Error(
    'Authentication required: provide either VITE_FILECOIN_PRIVATE_KEY or (VITE_WALLET_ADDRESS + VITE_SESSION_KEY)'
  )
}

if (hasStandardAuth && hasSessionKeyAuth) {
  throw new Error(
    'Conflicting authentication: provide either VITE_FILECOIN_PRIVATE_KEY or (VITE_WALLET_ADDRESS + VITE_SESSION_KEY), not both'
  )
}

// Use HTTP RPC URL by default (can be overridden by VITE_FILECOIN_RPC_URL env var)
const rpcUrl = normalizeEnvValue(import.meta.env.VITE_FILECOIN_RPC_URL) ?? RPC_URLS.calibration.http

export const filecoinPinConfig: SynapseSetupConfig = {
  privateKey: privateKey,
  walletAddress: walletAddress,
  sessionKey: sessionKey,
  rpcUrl: rpcUrl,
  warmStorageAddress: normalizeEnvValue(import.meta.env.VITE_WARM_STORAGE_ADDRESS),
}
