import { createStorageContext, type SynapseService } from 'filecoin-pin/core/synapse'
import pino from 'pino'
import { useCallback, useRef, useState } from 'react'
import {
  getStoredDataSetId,
  getStoredDataSetIdForProvider,
  storeDataSetId,
  storeDataSetIdForProvider,
} from '../lib/local-storage/data-set.ts'

type ProviderInfo = NonNullable<Awaited<ReturnType<typeof createStorageContext>>['providerInfo']>
type StorageContext = NonNullable<Awaited<ReturnType<typeof createStorageContext>>['storage']>

export type DataSetState =
  | { status: 'idle'; dataSetId?: number }
  | { status: 'initializing'; dataSetId?: number }
  | { status: 'ready'; dataSetId: number; storageContext: StorageContext; providerInfo: ProviderInfo }
  | { status: 'error'; error: string; dataSetId?: number }

interface UseDataSetManagerProps {
  synapse: SynapseService['synapse'] | null
  walletAddress: string | null
  /**
   * Optional debug/test parameters (typically from URL)
   * These override default behavior for testing/debugging.
   */
  debugParams?: {
    providerId?: number | null
    dataSetId?: number | null
  }
}

interface UseDataSetManagerReturn {
  dataSet: DataSetState
  ensureDataSet: () => Promise<number | null>
  storageContext: StorageContext | null
  providerInfo: ProviderInfo | null
}

/**
 * Hook to manage data set lifecycle for a wallet.
 *
 * Handles:
 * - Creating new data sets for first-time users
 * - Reconnecting to existing data sets via localStorage
 * - Managing storage context creation and caching
 * - Preventing duplicate concurrent initialization attempts
 * - Debug/test overrides via URL parameters (dataSetId, providerId)
 */
export function useDataSetManager({
  synapse,
  walletAddress,
  debugParams,
}: UseDataSetManagerProps): UseDataSetManagerReturn {
  const [dataSet, setDataSet] = useState<DataSetState>({ status: 'idle' })
  const isEnsuringDataSetRef = useRef<boolean>(false)

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
      // Return current dataSetId from state
      return new Promise<number | null>((resolve) => {
        setDataSet((current) => {
          resolve(current.dataSetId ?? null)
          return current
        })
      })
    }

    // Check if wallet is ready
    if (!walletAddress) {
      console.debug('[DataSet] Wallet not ready yet, will retry when ready')
      return null
    }

    if (!synapse) {
      console.debug('[DataSet] Synapse not initialized yet, will retry when ready')
      return null
    }

    // Check current state before setting the guard
    const shouldProceed = await new Promise<boolean>((resolve) => {
      setDataSet((current) => {
        // If we already have a data set ready, don't proceed
        if (current.status === 'ready' && current.dataSetId) {
          resolve(false)
          return current
        }

        // If already initializing (state-based check), don't proceed
        if (current.status === 'initializing') {
          console.debug('[DataSet] Already initializing (status check), skipping duplicate request')
          resolve(false)
          return current
        }

        resolve(true)
        return current
      })
    })

    if (!shouldProceed) {
      // Return current dataSetId
      return new Promise<number | null>((resolve) => {
        setDataSet((current) => {
          resolve(current.dataSetId ?? null)
          return current
        })
      })
    }

    // Set the ref guard only after checking we should proceed
    isEnsuringDataSetRef.current = true

    try {
      // Check for debug/test parameters from URL
      const urlDataSetId = debugParams?.dataSetId
      const urlProviderId = debugParams?.providerId

      // Check localStorage with priority:
      // 1. If providerId specified, check provider-specific key
      // 2. Otherwise, check default wallet-only key (existing behavior)
      console.debug('[DataSet] Checking localStorage for wallet:', walletAddress)
      const storedId = urlProviderId
        ? getStoredDataSetIdForProvider(walletAddress, urlProviderId)
        : getStoredDataSetId(walletAddress)
      console.debug('[DataSet] StoredId from localStorage:', storedId)

      // Determine which data set ID to use (URL > localStorage)
      const dataSetId = urlDataSetId ?? storedId

      // Need to create storage context (either for existing or new data set)
      setDataSet((prev) => ({ status: 'initializing', dataSetId: dataSetId ?? prev.dataSetId }))

      try {
        const logger = pino({
          level: 'debug',
          browser: {
            asObject: true,
          },
        })

        // Build provider options for debug/test mode
        const providerOptions: { providerId?: number } = {}
        if (urlProviderId) {
          providerOptions.providerId = urlProviderId
        }

        if (dataSetId) {
          console.debug(
            '[DataSet] Found existing data set ID, creating storage context:',
            dataSetId,
            urlDataSetId ? '(from URL)' : '(from localStorage)'
          )

          const result = await createStorageContext(synapse, logger, {
            ...providerOptions,
            dataset: {
              useExisting: dataSetId,
            },
          })

          setDataSet({
            status: 'ready',
            dataSetId: dataSetId,
            storageContext: result.storage,
            providerInfo: result.providerInfo,
          })
          return dataSetId
        }

        console.debug('[DataSet] Creating new data set for wallet:', walletAddress)

        const result = await createStorageContext(synapse, logger, {
          ...providerOptions,
          dataset: {
            createNew: true,
          },
        })

        const newDataSetId = result.storage.dataSetId
        if (!newDataSetId) {
          throw new Error('Data set ID not returned from storage context creation')
        }

        // Store for future use (unless we're in debug mode with URL dataSetId override)
        if (urlDataSetId) {
          console.debug('[DataSet] Created new data set ID (not storing due to URL override):', newDataSetId)
        } else if (urlProviderId) {
          // If providerId was specified, store with provider-specific key
          // Otherwise use default wallet-only key (existing behavior)
          storeDataSetIdForProvider(walletAddress, urlProviderId, newDataSetId)
          console.debug(
            '[DataSet] Created and stored new data set ID with provider:',
            newDataSetId,
            'provider:',
            urlProviderId
          )
        } else {
          storeDataSetId(walletAddress, newDataSetId)
          console.debug('[DataSet] Created and stored new data set ID:', newDataSetId)
        }

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
  }, [walletAddress, synapse, debugParams])

  return {
    dataSet,
    ensureDataSet,
    storageContext: dataSet.status === 'ready' ? dataSet.storageContext : null,
    providerInfo: dataSet.status === 'ready' ? dataSet.providerInfo : null,
  }
}
