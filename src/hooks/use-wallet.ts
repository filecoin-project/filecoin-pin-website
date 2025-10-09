import { useContext, useMemo } from 'react'
import { FilecoinPinContext } from '../context/filecoin-pin-provider.tsx'

export const useWallet = () => {
  const context = useContext(FilecoinPinContext)
  if (!context) {
    throw new Error('useWallet must be used within FilecoinPinProvider')
  }

  const { wallet, refreshWallet } = context

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
