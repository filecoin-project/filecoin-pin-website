import type { SynapseService } from 'filecoin-pin/core/synapse'
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DataSetState, useDataSetManager } from '../hooks/use-data-set-manager.ts'
import { filecoinPinConfig } from '../lib/filecoin-pin/config.ts'
import { getSynapseClient } from '../lib/filecoin-pin/synapse.ts'
import { fetchWalletSnapshot, type WalletSnapshot } from '../lib/filecoin-pin/wallet.ts'

type ProviderInfo = NonNullable<ReturnType<typeof useDataSetManager>['providerInfo']>
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
  ensureDataSet: () => Promise<number | null>
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

  // Use the data set manager hook
  const { dataSet, ensureDataSet, storageContext, providerInfo } = useDataSetManager({
    synapse: synapseRef.current,
    walletAddress: wallet.status === 'ready' ? wallet.data.address : null,
  })

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

  /**
   * Proactively ensure data set when wallet and synapse are ready
   * This creates a better UX by having the data set ready before users attempt to upload, preventing long looking upload times.
   *
   * Trade-off: This may create data sets for users who just visit the site but never upload.
   * This means some USDFC will be used and locked up for Data Sets that may never be used, but this ensures a smooth upload experience for our demo.
   * Also, dataset creation fee is being removed in next release, so this won't really be a concern at that point.
   * @see https://github.com/filecoin-project/filecoin-pin-website/issues/11
   *
   * Keep in mind that in the regular filecoin-pin flow, there is a single user with a single wallet, and synapse/filecoin-pin will select a dataset for you automatically.
   * Users usually don't need to worry about this, but for our demo, we want to ensure a smooth upload experience for users who visit the site but never upload.
   */
  useEffect(() => {
    if (wallet.status === 'ready' && synapseRef.current && dataSet.status === 'idle') {
      console.debug('[DataSet] Wallet and Synapse ready, proactively ensuring data set')
      void ensureDataSet()
    }
  }, [wallet.status, ensureDataSet, dataSet.status])

  const value = useMemo<FilecoinPinContextValue>(
    () => ({
      wallet,
      refreshWallet,
      synapse: synapseRef.current,
      dataSet,
      ensureDataSet,
      storageContext,
      providerInfo,
    }),
    [wallet, refreshWallet, dataSet, ensureDataSet, storageContext, providerInfo]
  )

  return <FilecoinPinContext.Provider value={value}>{children}</FilecoinPinContext.Provider>
}
