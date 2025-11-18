import type { SynapseService } from 'filecoin-pin/core/synapse'
import { useCallback, useRef, useState } from 'react'
import type { StorageContextHelperResult } from '../lib/filecoin-pin/storage-context-helper.ts'
import {
  createStorageContextForNewDataSet,
  createStorageContextFromDataSetId,
} from '../lib/filecoin-pin/storage-context-helper.ts'
import { getStoredDataSetId } from '../lib/local-storage/data-set.ts'

type ProviderInfo = SynapseService['providerInfo']
type StorageContext = StorageContextHelperResult['storage']

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
 * - Reconnecting to existing data sets discovered via localStorage
 * - Resolving storage contexts through Synapse and caching them
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
      const urlDataSetId = debugParams?.dataSetId ?? null
      const urlProviderId = debugParams?.providerId ?? null
      const hasUrlOverrides = urlDataSetId !== null || urlProviderId !== null

      console.debug('[DataSet] Checking localStorage for wallet:', walletAddress)
      const storedDataSetId = hasUrlOverrides ? null : getStoredDataSetId(walletAddress)
      if (storedDataSetId !== null) {
        console.debug('[DataSet] Found stored data set ID from localStorage:', storedDataSetId)
      }

      const effectiveDataSetId = urlDataSetId ?? storedDataSetId
      if (urlDataSetId !== null) {
        console.debug('[DataSet] Using data set ID from URL override:', urlDataSetId)
      } else if (storedDataSetId !== null) {
        console.debug('[DataSet] Using data set ID from localStorage:', storedDataSetId)
      } else {
        console.debug('[DataSet] No data set ID overrides found, will create or resolve automatically')
      }

      // Need to create storage context (either for existing or new data set)
      setDataSet(() => ({
        status: 'initializing',
        dataSetId: effectiveDataSetId ?? undefined,
      }))

      try {
        if (effectiveDataSetId !== null) {
          if (urlProviderId !== null) {
            console.debug('[DataSet] Ignoring provider override because dataset ID was provided')
          }
          const { storage, providerInfo } = await createStorageContextFromDataSetId(synapse, effectiveDataSetId)
          setDataSet({
            status: 'ready',
            dataSetId: effectiveDataSetId,
            storageContext: storage,
            providerInfo,
          })
          return effectiveDataSetId
        }

        const { storage, providerInfo } = await createStorageContextForNewDataSet(synapse, {
          providerId: urlProviderId ?? undefined,
        })
        const resolvedDataSetId = storage.dataSetId ?? null
        setDataSet({
          status: 'ready',
          dataSetId: resolvedDataSetId,
          storageContext: storage,
          providerInfo,
        })
        return resolvedDataSetId
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
