import { createStorageContext, type SynapseService } from 'filecoin-pin/core/synapse'
import pino from 'pino'
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { filecoinPinConfig } from '../lib/filecoin-pin/config.ts'
import { getSynapseClient } from '../lib/filecoin-pin/synapse.ts'
import { fetchWalletSnapshot, type WalletSnapshot } from '../lib/filecoin-pin/wallet.ts'
import { getStoredDataSetId, storeDataSetId } from '../lib/local-storage/data-set.ts'

type ProviderInfo = SynapseService['providerInfo']
type StorageContext = SynapseService['storage']

type WalletState =
  | { status: 'idle'; data?: WalletSnapshot }
  | { status: 'loading'; data?: WalletSnapshot }
  | { status: 'ready'; data: WalletSnapshot }
  | { status: 'error'; error: string; data?: WalletSnapshot }

type DataSetState =
  | { status: 'idle'; dataSetId?: number }
  | { status: 'initializing'; dataSetId?: number }
  | { status: 'ready'; dataSetId: number; storageContext: StorageContext; providerInfo: ProviderInfo }
  | { status: 'error'; error: string; dataSetId?: number }

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
const initialDataSetState: DataSetState = { status: 'idle' }

export const FilecoinPinProvider = ({ children }: { children: ReactNode }) => {
  const [wallet, setWallet] = useState<WalletState>(initialWalletState)
  const [dataSet, setDataSet] = useState<DataSetState>(initialDataSetState)
  const synapseRef = useRef<SynapseService['synapse'] | null>(null)
  const isEnsuringDataSetRef = useRef<boolean>(false)
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

  /**
   * Ensure a data set exists for the current wallet.
   *
   * This is called both:
   * 1. Proactively when wallet + synapse are ready (for better UX)
   * 2. On-demand when user shows upload intent (file selected, drag hover, etc.)
   *
   * - Returns null if wallet/synapse aren't ready yet (will retry automatically)
   * - Checks localStorage for existing data set ID
   * - If found, returns it immediately
   * - If not found, creates a new data set and stores it
   * - Guards against duplicate concurrent calls using a ref
   *
   * @returns The data set ID, or null if prerequisites aren't ready or initialization fails
   */
  const ensureDataSet = useCallback(async (): Promise<number | null> => {
    // Guard against duplicate concurrent calls (before state updates)
    if (isEnsuringDataSetRef.current) {
      console.debug('[DataSet] Already ensuring data set (guarded by ref), skipping duplicate call')
      return dataSet.dataSetId ?? null
    }

    // Set the ref guard
    isEnsuringDataSetRef.current = true

    try {
      const synapse = synapseRef.current

      // Check if wallet is ready
      if (wallet.status !== 'ready' || !wallet.data?.address) {
        console.debug('[DataSet] Wallet not ready yet, will retry when ready')
        return null
      }

      if (!synapse) {
        console.debug('[DataSet] Synapse not initialized yet, will retry when ready')
        return null
      }

      // If we already have a data set ready, return it immediately
      if (dataSet.status === 'ready' && dataSet.dataSetId) {
        return dataSet.dataSetId
      }

      // If already initializing (state-based check), wait for it
      if (dataSet.status === 'initializing') {
        console.debug('[DataSet] Already initializing (status check), skipping duplicate request')
        return dataSet.dataSetId ?? null
      }

      const walletAddress = wallet.data.address

      // Check localStorage first
      const storedId = getStoredDataSetId(walletAddress)

      // Need to create storage context (either for existing or new data set)
      setDataSet((prev) => ({ status: 'initializing', dataSetId: storedId ?? prev.dataSetId }))

      try {
        const logger = pino({
          level: 'debug',
          browser: {
            asObject: true,
          },
        })

        if (storedId) {
          console.debug('[DataSet] Found existing data set ID in localStorage, creating storage context:', storedId)

          const result = await createStorageContext(synapse, logger, {
            dataset: {
              useExisting: storedId,
            },
          })

          setDataSet({
            status: 'ready',
            dataSetId: storedId,
            storageContext: result.storage,
            providerInfo: result.providerInfo,
          })
          return storedId
        }

        console.debug('[DataSet] Creating new data set for wallet:', walletAddress)

        const result = await createStorageContext(synapse, logger, {
          dataset: {
            createNew: true,
          },
        })

        const newDataSetId = result.storage.dataSetId
        if (!newDataSetId) {
          throw new Error('Data set ID not returned from storage context creation')
        }

        // Store for future use
        storeDataSetId(walletAddress, newDataSetId)
        console.debug('[DataSet] Created and stored new data set ID:', newDataSetId)

        setDataSet({
          status: 'ready',
          dataSetId: newDataSetId,
          storageContext: result.storage,
          providerInfo: result.providerInfo,
        })
        return newDataSetId
      } catch (error) {
        console.error('[DataSet] Failed to create data set:', error)
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize data set'
        setDataSet((prev) => ({
          status: 'error',
          error: errorMessage,
          dataSetId: prev.dataSetId,
        }))
        return null
      }
    } finally {
      // Always release the guard, even on early returns
      isEnsuringDataSetRef.current = false
    }
  }, [wallet, dataSet, config])

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
      storageContext: dataSet.status === 'ready' ? dataSet.storageContext : null,
      providerInfo: dataSet.status === 'ready' ? dataSet.providerInfo : null,
    }),
    [wallet, refreshWallet, dataSet, ensureDataSet]
  )

  return <FilecoinPinContext.Provider value={value}>{children}</FilecoinPinContext.Provider>
}
