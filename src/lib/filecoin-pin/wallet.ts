import { TIME_CONSTANTS } from '@filoz/synapse-core/utils'
import { getPaymentStatus, type PaymentStatus } from 'filecoin-pin/core/payments'
import { formatFIL, formatUSDFC } from 'filecoin-pin/core/utils'
import { LOW_STORAGE_RUNWAY_DAYS } from './config.ts'
import type { Synapse } from './synapse.ts'

export function storageFundsStatus(account: {
  availableFunds: bigint
  debt: bigint
  lockupRatePerEpoch: bigint
  runwayInEpochs: bigint
}) {
  if (account.availableFunds <= 0n || account.debt > 0n) return 'needed'
  if (
    account.lockupRatePerEpoch > 0n &&
    account.runwayInEpochs < BigInt(LOW_STORAGE_RUNWAY_DAYS) * TIME_CONSTANTS.EPOCHS_PER_DAY
  )
    return 'low'
  return 'available'
}

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

export const fetchWalletSnapshot = async (synapse: Synapse): Promise<WalletSnapshot> => {
  const status = await getPaymentStatus(synapse)
  const isCalibration = status.chainId === 314159
  const usdfcLabel = isCalibration ? 'tUSDFC' : 'USDFC'
  const snapshot: WalletSnapshot = {
    address: status.address,
    network: isCalibration ? 'calibration' : 'mainnet',
    filBalance: status.filBalance,
    walletUsdfcBalance: status.walletUsdfcBalance,
    formatted: {
      fil: formatFIL(status.filBalance, isCalibration, 2),
      usdfc: `${formatUSDFC(status.walletUsdfcBalance, 2)} ${usdfcLabel}`,
    },
    raw: status,
  }
  return snapshot
}
