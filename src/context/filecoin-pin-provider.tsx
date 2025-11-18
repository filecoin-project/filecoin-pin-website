import type { SynapseService } from 'filecoin-pin/core/synapse'
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DataSetState, useDataSetManager } from '../hooks/use-data-set-manager.ts'
import { filecoinPinConfig } from '../lib/filecoin-pin/config.ts'
import { getSynapseClient } from '../lib/filecoin-pin/synapse.ts'
import { fetchWalletSnapshot, type WalletSnapshot } from '../lib/filecoin-pin/wallet.ts'
import { getDebugParams, logDebugParams } from '../utils/debug-params.ts'

type ProviderInfo = SynapseService['providerInfo']
type StorageContext = NonNullable<ReturnType<typeof useDataSetManager>['storageContext']>

type WalletState =
  | { status: 'idle'; data?: WalletSnapshot }
  | { status: 'loading'; data?: WalletSnapshot }
  | { status: 'ready'; data: WalletSnapshot }
  | { status: 'error'; error: string; data?: WalletSnapshot }

export interface FilecoinPinContextValue {
  wallet: WalletState
  refreshWallet: () => Promise<void>
  synapse: SynapseService['synapse'] | null
  dataSet: DataSetState
  checkIfDatasetExists: () => Promise<number | null>
  /**
   * Storage context for the current data set.
   * Only available when dataSet.status === 'ready'.
   * This is created once and reused for all uploads to avoid redundant provider selection.
   */
  storageContext: StorageContext | null
  providerInfo: ProviderInfo | null
}

export const FilecoinPinContext = createContext<FilecoinPinContextValue | undefined>(undefined)

const initialWalletState: WalletState = { status: 'idle' }

export const FilecoinPinProvider = ({ children }: { children: ReactNode }) => {
  const [wallet, setWallet] = useState<WalletState>(initialWalletState)
  const synapseRef = useRef<SynapseService['synapse'] | null>(null)
  const config = filecoinPinConfig

  // Parse debug parameters from URL (for testing/debugging)
  const debugParams = useMemo(() => getDebugParams(), [])

  // Use the data set manager hook
  const { dataSet, checkIfDatasetExists, storageContext, providerInfo } = useDataSetManager({
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

      // Expose debugDump method on window object
      window.debugDump = () => {
        if (synapse.telemetry?.debugDump) {
          console.debug(JSON.stringify(synapse.telemetry.debugDump(), null, 2))
        } else {
          console.warn('debugDump method not found on synapse.telemetry')
        }
      }

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

  // Log debug parameters if any are set
  useEffect(() => {
    logDebugParams()
  }, [])

  /**
   * Proactively check if data set exists when wallet and synapse are ready
   * We need to check for an existing data set in order to load previously uploaded pieces.
   *
   * Keep in mind that in the regular filecoin-pin flow, there is a single user with a single wallet, and synapse/filecoin-pin will select a dataset for you automatically.
   * Users usually don't need to worry about this, but for our demo, we want to check for existing data sets proactively.
   */
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
      storageContext,
      providerInfo,
    }),
    [wallet, refreshWallet, dataSet, checkIfDatasetExists, storageContext, providerInfo]
  )

  return <FilecoinPinContext.Provider value={value}>{children}</FilecoinPinContext.Provider>
}
