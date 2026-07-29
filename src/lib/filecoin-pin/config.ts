import type { SynapseSetupConfig } from 'filecoin-pin/core/synapse'
import type { Hex } from 'viem'

const normalizeEnvValue = (value: string | boolean | number | undefined) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

// Hardcoded defaults (can be overridden by env vars) expires: 2027-01-18 07:51:06
// Signer: 0x6CCE68E42e436230d36B59b992de43619f216eA2 — matches VITE_SESSION_KEY in Vercel.
// Rotate via docs/update-session-key.md and update this value so repo and prod stay in sync.
const DEFAULT_WALLET_ADDRESS: Hex = '0x44f08D1beFe61255b3C3A349C392C560FA333759'
const DEFAULT_SESSION_KEY: Hex = '0x256b25c8af80f47d81752dea07109ad9a7073ef2f7516c61f4abb3496770c710'

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
