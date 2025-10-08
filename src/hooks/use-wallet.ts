import { useMemo } from 'react'
import { useFilecoinPin } from './use-filecoin-pin.ts'

export const useWallet = () => {
  const { wallet, refreshWallet } = useFilecoinPin()

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
