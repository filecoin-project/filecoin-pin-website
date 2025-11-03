import { getPaymentStatus, type PaymentStatus } from 'filecoin-pin/core/payments'
import type { SynapseService } from 'filecoin-pin/core/synapse'
import { formatFIL, formatUSDFC } from 'filecoin-pin/core/utils'

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

export const fetchWalletSnapshot = async (synapse: SynapseService['synapse']): Promise<WalletSnapshot> => {
  const status = await getPaymentStatus(synapse)
  const isCalibration = status.network === 'calibration'
  const usdfcLabel = isCalibration ? 'tUSDFC' : 'USDFC'
  return {
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
}
