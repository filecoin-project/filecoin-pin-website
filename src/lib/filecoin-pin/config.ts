import type { SynapseSetupConfig } from 'filecoin-pin/core/synapse'
import type { Hex } from 'viem'

const normalizeEnvValue = (value: string | boolean | number | undefined) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

// Hardcoded defaults (can be overridden by env vars) expires: 2026-08-15 09:24:22
const DEFAULT_WALLET_ADDRESS: Hex = '0x44f08D1beFe61255b3C3A349C392C560FA333759'
const DEFAULT_SESSION_KEY: Hex = '0x416dc827726298c032acf086ddf45c1de79b8e62f3af2ffe0377afe08862deb3'

const privateKey = normalizeEnvValue(import.meta.env.VITE_FILECOIN_PRIVATE_KEY) as Hex | undefined
const envWalletAddress = normalizeEnvValue(import.meta.env.VITE_WALLET_ADDRESS) as Hex | undefined
const envSessionKey = normalizeEnvValue(import.meta.env.VITE_SESSION_KEY) as Hex | undefined

// Only treat session-key auth as user-supplied when at least one of the env vars is set.
// Hardcoded defaults must not trigger the conflict check when a private key is provided.
const hasUserSessionKeyAuth = envWalletAddress != null || envSessionKey != null

if (privateKey != null && hasUserSessionKeyAuth) {
  throw new Error(
    'Conflicting authentication: provide either VITE_FILECOIN_PRIVATE_KEY or (VITE_WALLET_ADDRESS + VITE_SESSION_KEY), not both'
  )
}

const walletAddress = (envWalletAddress ?? DEFAULT_WALLET_ADDRESS) as Hex
const sessionKey = (envSessionKey ?? DEFAULT_SESSION_KEY) as Hex

export const filecoinPinConfig: SynapseSetupConfig = privateKey
  ? { privateKey, rpcUrl: normalizeEnvValue(import.meta.env.VITE_FILECOIN_RPC_URL) }
  : {
      walletAddress,
      sessionKey,
      rpcUrl: normalizeEnvValue(import.meta.env.VITE_FILECOIN_RPC_URL),
    }
