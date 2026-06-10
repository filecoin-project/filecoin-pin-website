import { getPaymentStatus, type PaymentStatus } from 'filecoin-pin/core/payments'
import { formatFIL, formatUSDFC } from 'filecoin-pin/core/utils'
import { filecoinPinConfig } from './config.ts'
import type { Synapse } from './synapse.ts'

export const shortenAddress = (address: string, visibleChars = 4) => {
  if (address.length <= visibleChars * 2) return address
  const prefix = address.slice(0, visibleChars + 2) // include 0x
  const suffix = address.slice(-visibleChars)
  return `${prefix}...${suffix}`
}

export interface WalletSnapshot {
  address: string
  network: string
  filBalance: bigint
  walletUsdfcBalance: bigint
  formatted: {
    fil: string
    usdfc: string
  }
  raw: PaymentStatus
}

/**
 * The payment status query behind the snapshot makes four eth_calls (FIL
 * balance, USDFC balance, deposited balance, service approval). The snapshot
 * only drives the header balance display for the shared demo wallet, so it is
 * fetched once per browser session and reused from sessionStorage on reloads.
 */
const SNAPSHOT_CACHE_KEY = 'filecoin-pin-wallet-snapshot-v1'

const BIGINT_TAG = '__bigint__'

const serializeSnapshot = (snapshot: WalletSnapshot): string =>
  JSON.stringify(snapshot, (_key, value) => (typeof value === 'bigint' ? `${BIGINT_TAG}${value}` : value))

const deserializeSnapshot = (raw: string): WalletSnapshot =>
  JSON.parse(raw, (_key, value) =>
    typeof value === 'string' && value.startsWith(BIGINT_TAG) ? BigInt(value.slice(BIGINT_TAG.length)) : value
  )

const configuredWalletAddress = 'walletAddress' in filecoinPinConfig ? filecoinPinConfig.walletAddress : null

const readCachedSnapshot = (): WalletSnapshot | null => {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_CACHE_KEY)
    if (!raw) return null
    const snapshot = deserializeSnapshot(raw)
    // Ignore a snapshot cached for a different wallet (e.g. config changed
    // between deploys within the same browser session).
    if (configuredWalletAddress != null && snapshot.address.toLowerCase() !== configuredWalletAddress.toLowerCase()) {
      return null
    }
    return snapshot
  } catch {
    return null
  }
}

const writeCachedSnapshot = (snapshot: WalletSnapshot): void => {
  try {
    sessionStorage.setItem(SNAPSHOT_CACHE_KEY, serializeSnapshot(snapshot))
  } catch (error) {
    console.warn('[Wallet] Failed to cache wallet snapshot:', error)
  }
}

export const fetchWalletSnapshot = async (synapse: Synapse): Promise<WalletSnapshot> => {
  const cached = readCachedSnapshot()
  if (cached) {
    console.debug('[Wallet] Using cached wallet snapshot (no RPC)')
    return cached
  }

  const status = await getPaymentStatus(synapse)
  const isCalibration = status.network === 'calibration'
  const usdfcLabel = isCalibration ? 'tUSDFC' : 'USDFC'
  const snapshot: WalletSnapshot = {
    address: status.address,
    network: status.network,
    filBalance: status.filBalance,
    walletUsdfcBalance: status.walletUsdfcBalance,
    formatted: {
      fil: formatFIL(status.filBalance, isCalibration, 2),
      usdfc: `${formatUSDFC(status.walletUsdfcBalance, 2)} ${usdfcLabel}`,
    },
    raw: status,
  }
  writeCachedSnapshot(snapshot)
  return snapshot
}
