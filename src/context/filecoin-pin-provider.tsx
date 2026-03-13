import { createContext, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DataSetState, useDataSetManager } from '../hooks/use-data-set-manager.ts'
import { filecoinPinConfig } from '../lib/filecoin-pin/config.ts'
import { getSynapseClient, type Synapse } from '../lib/filecoin-pin/synapse.ts'
import { fetchWalletSnapshot, type WalletSnapshot } from '../lib/filecoin-pin/wallet.ts'
import { getDebugParams, logDebugParams } from '../utils/debug-params.ts'

type WalletState =
  | { status: 'idle'; data?: WalletSnapshot }
  | { status: 'loading'; data?: WalletSnapshot }
  | { status: 'ready'; data: WalletSnapshot }
  | { status: 'error'; error: string; data?: WalletSnapshot }

export interface FilecoinPinContextValue {
  wallet: WalletState
  refreshWallet: () => Promise<void>
  synapse: Synapse | null
  dataSet: DataSetState
  checkIfDatasetExists: () => Promise<bigint | null>
  setDataSetId: (id: bigint) => void
}

export const FilecoinPinContext = createContext<FilecoinPinContextValue | undefined>(undefined)

const initialWalletState: WalletState = { status: 'idle' }

export const FilecoinPinProvider = ({ children }: { children: ReactNode }) => {
  const [wallet, setWallet] = useState<WalletState>(initialWalletState)
  const synapseRef = useRef<Synapse | null>(null)
  const config = filecoinPinConfig

  const debugParams = useMemo(() => getDebugParams(), [])

  const { dataSet, checkIfDatasetExists, setDataSetId } = useDataSetManager({
    synapse: synapseRef.current,
    walletAddress: wallet.status === 'ready' ? wallet.data.address : null,
    debugParams,
  })

  const refreshWallet = useCallback(async () => {
    setWallet((prev) => ({
      status: 'loading',
      data: prev.status === 'ready' ? prev.data : undefined,
    }))

    try {
      const synapse = await getSynapseClient(config)
      synapseRef.current = synapse

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

  useEffect(() => {
    logDebugParams()
  }, [])

  // Proactively check for existing data set when prerequisites are ready,
  // so we can load upload history before the user interacts
  useEffect(() => {
    if (wallet.status === 'ready' && synapseRef.current && dataSet.status === 'idle') {
      console.debug('[DataSet] Wallet and Synapse ready, proactively checking if data set exists')
      void checkIfDatasetExists()
    }
  }, [wallet.status, checkIfDatasetExists, dataSet.status])

  const value = useMemo<FilecoinPinContextValue>(
    () => ({
      wallet,
      refreshWallet,
      synapse: synapseRef.current,
      dataSet,
      checkIfDatasetExists,
      setDataSetId,
    }),
    [wallet, refreshWallet, dataSet, checkIfDatasetExists, setDataSetId]
  )

  return <FilecoinPinContext.Provider value={value}>{children}</FilecoinPinContext.Provider>
}
