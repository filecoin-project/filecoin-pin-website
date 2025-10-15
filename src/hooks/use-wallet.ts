import { useMemo } from 'react'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'

/**
 * Lightweight hook around the wallet state for UI consumption.
 * Exposes formatted balances, network, and a refresh action without
 * leaking the full provider context into components.
 */
export const useWallet = () => {
  const { wallet, refreshWallet } = useFilecoinPinContext()

  return useMemo(
    () => ({
      status: wallet.status,
      address: wallet.data?.address,
      network: wallet.data?.network,
      balances: wallet.data?.formatted,
      raw: wallet.data?.raw,
      error: wallet.status === 'error' ? wallet.error : undefined,
      refresh: refreshWallet,
    }),
    [wallet, refreshWallet]
  )
}
