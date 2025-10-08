import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { filecoinPinConfig } from '../lib/filecoin-pin/config.ts'
import { getSynapseClient } from '../lib/filecoin-pin/synapse.ts'
import { fetchWalletSnapshot, type WalletSnapshot } from '../lib/filecoin-pin/wallet.ts'

type WalletState =
  | { status: 'idle'; data?: WalletSnapshot }
  | { status: 'loading'; data?: WalletSnapshot }
  | { status: 'ready'; data: WalletSnapshot }
  | { status: 'error'; error: string; data?: WalletSnapshot }

export interface FilecoinPinContextValue {
  wallet: WalletState
  refreshWallet: () => Promise<void>
}

export const FilecoinPinContext = createContext<FilecoinPinContextValue | undefined>(undefined)

const initialState: WalletState = { status: 'idle' }

export const FilecoinPinProvider = ({ children }: { children: ReactNode }) => {
  const [wallet, setWallet] = useState<WalletState>(initialState)
  const config = filecoinPinConfig

  const refreshWallet = useCallback(async () => {
    if (!config.privateKey) {
      setWallet((prev) => ({
        status: 'error',
        error: 'Missing VITE_FILECOIN_PRIVATE_KEY environment variable. Wallet data unavailable.',
        data: prev.data,
      }))
      return
    }

    setWallet((prev) => ({
      status: 'loading',
      data: prev.status === 'ready' ? prev.data : undefined,
    }))

    try {
      const synapse = await getSynapseClient(config)
      const snapshot = await fetchWalletSnapshot(synapse)
      setWallet({
        status: 'ready',
        data: snapshot,
      })
    } catch (error) {
      console.error('Failed to load wallet balances', error)
      setWallet((prev) => ({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unable to load wallet balances. See console for details.',
        data: prev.data,
      }))
    }
  }, [config])

  useEffect(() => {
    void refreshWallet()
  }, [refreshWallet])

  const value = useMemo<FilecoinPinContextValue>(
    () => ({
      wallet,
      refreshWallet,
    }),
    [wallet, refreshWallet]
  )

  return <FilecoinPinContext.Provider value={value}>{children}</FilecoinPinContext.Provider>
}
