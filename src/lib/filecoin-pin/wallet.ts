import { getPaymentStatus, type PaymentStatus } from 'filecoin-pin/core/payments'
import type { SynapseService } from 'filecoin-pin/core/synapse'

export const formatTokenBalance = (balance: bigint, decimals: number, fractionDigits = 4) => {
  const negative = balance < 0n
  const absolute = negative ? -balance : balance
  const divisor = 10n ** BigInt(decimals)
  const whole = absolute / divisor
  const remainder = absolute % divisor

  if (remainder === 0n) {
    return negative ? `-${whole.toString()}` : whole.toString()
  }

  const remainderString = remainder.toString().padStart(Number(divisor.toString().length - 1), '0')
  const trimmed = remainderString.slice(0, fractionDigits).replace(/0+$/, '')
  const fraction = trimmed.length > 0 ? trimmed : '0'
  const value = `${whole.toString()}.${fraction}`
  return negative ? `-${value}` : value
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
  usdfcBalance: bigint
  formatted: {
    fil: string
    usdfc: string
  }
  raw: PaymentStatus
}

export const fetchWalletSnapshot = async (synapse: SynapseService['synapse']): Promise<WalletSnapshot> => {
  const status = await getPaymentStatus(synapse)
  return {
    address: status.address,
    network: status.network,
    filBalance: status.filBalance,
    usdfcBalance: status.usdfcBalance,
    formatted: {
      fil: formatTokenBalance(status.filBalance, 18),
      usdfc: formatTokenBalance(status.usdfcBalance, 18),
    },
    raw: status,
  }
}
