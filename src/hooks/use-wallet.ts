import { useMemo } from 'react'
import { useFilecoinPin } from './use-filecoin-pin.ts'

export const useWallet = () => {
  const { wallet, refreshWallet } = useFilecoinPin()

  return useMemo(
    () => ({
      status: wallet.status,
      address: wallet.status === 'ready' ? wallet.data.address : wallet.data?.address,
      network: wallet.status === 'ready' ? wallet.data.network : wallet.data?.network,
      balances: wallet.status === 'ready' ? wallet.data.formatted : wallet.data?.formatted,
      raw: wallet.status === 'ready' ? wallet.data.raw : wallet.data?.raw,
      error: wallet.status === 'error' ? wallet.error : undefined,
      refresh: refreshWallet,
    }),
    [wallet, refreshWallet]
  )
}
