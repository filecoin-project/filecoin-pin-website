import type { ProviderInfo } from '@filoz/synapse-sdk'
import { createStorageContext, type SynapseService } from 'filecoin-pin/core/synapse'
import pino from 'pino'
import { useCallback, useRef, useState } from 'react'
import { getStoredDataSetId, getStoredDataSetIdForProvider } from '../lib/local-storage/data-set.ts'

type StorageContext = NonNullable<Awaited<ReturnType<typeof createStorageContext>>['storage']>

export type DataSetState =
  | { status: 'idle'; dataSetId?: number }
  | { status: 'initializing'; dataSetId?: number }
  | { status: 'ready'; dataSetId: number | null; storageContext: StorageContext; providerInfo: ProviderInfo }
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
  checkIfDatasetExists: () => Promise<number | null>
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
  const isCheckingDataSetRef = useRef<boolean>(false)

  /**
   * Check if a data set exists for the current wallet.
   *
   * This is called both:
   * 1. Proactively when wallet + synapse are ready (for better UX)
   * 2. On-demand when user shows upload intent (file selected, drag hover, etc.)
   *
   * - Returns null if wallet/synapse aren't ready yet (will retry automatically)
   * - Checks localStorage for existing data set ID
   * - If found, returns it immediately
   * - If not found, returns null (does not create a new data set)
   * - Guards against duplicate concurrent calls using a ref
   *
   * @returns The data set ID if found, or null if not found or prerequisites aren't ready
   */
  const checkIfDatasetExists = useCallback(async (): Promise<number | null> => {
    // Guard against duplicate concurrent calls (before state updates)
    if (isCheckingDataSetRef.current) {
      console.debug('[DataSet] Already checking data set (guarded by ref), skipping duplicate call')
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
    isCheckingDataSetRef.current = true

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

        // we don't have a dataset id, and don't want to create one, but we need a storage context to exist.
        const result = await createStorageContext(synapse, logger)
        setDataSet({
          status: 'ready',
          dataSetId: result.storage.dataSetId ?? null,
          storageContext: result.storage,
          providerInfo: result.providerInfo,
        })
        return result.storage.dataSetId ?? null
      } catch (error) {
        console.error('[DataSet] Failed to check data set:', error)
        const errorMessage = error instanceof Error ? error.message : 'Failed to check data set'
        setDataSet(() => ({
          status: 'error',
          error: errorMessage,
        }))
        return null
      }
    } finally {
      // Always release the guard, even on early returns
      isCheckingDataSetRef.current = false
    }
  }, [walletAddress, synapse, debugParams])

  return {
    dataSet,
    checkIfDatasetExists,
    storageContext: dataSet.status === 'ready' ? dataSet.storageContext : null,
    providerInfo: dataSet.status === 'ready' ? dataSet.providerInfo : null,
  }
}
