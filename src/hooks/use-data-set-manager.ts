import { useCallback, useRef, useState } from 'react'
import type { Synapse } from '../lib/filecoin-pin/synapse.ts'
import { getStoredDataSetId } from '../lib/local-storage/data-set.ts'

export type DataSetState =
  | { status: 'idle'; dataSetId?: bigint }
  | { status: 'initializing'; dataSetId?: bigint }
  | { status: 'ready'; dataSetId: bigint | null }
  | { status: 'error'; error: string; dataSetId?: bigint }

interface UseDataSetManagerProps {
  synapse: Synapse | null
  walletAddress: string | null
  debugParams?: {
    providerId?: number | null
    dataSetId?: number | null
  }
}

interface UseDataSetManagerReturn {
  dataSet: DataSetState
  checkIfDatasetExists: () => Promise<bigint | null>
  setDataSetId: (id: bigint) => void
}

/**
 * Hook to track data set ID for a wallet.
 *
 * In 0.38+, StorageContext and provider info are handled by the SDK internally
 * during upload. This hook only tracks the dataSetId for history loading.
 */
export function useDataSetManager({
  synapse,
  walletAddress,
  debugParams,
}: UseDataSetManagerProps): UseDataSetManagerReturn {
  const [dataSet, setDataSet] = useState<DataSetState>({ status: 'idle' })
  const isCheckingDataSetRef = useRef<boolean>(false)

  const checkIfDatasetExists = useCallback(async (): Promise<bigint | null> => {
    if (isCheckingDataSetRef.current) {
      return new Promise<bigint | null>((resolve) => {
        setDataSet((current) => {
          resolve(current.dataSetId ?? null)
          return current
        })
      })
    }

    if (!walletAddress) {
      return null
    }

    if (!synapse) {
      return null
    }

    const shouldProceed = await new Promise<boolean>((resolve) => {
      setDataSet((current) => {
        if (current.status === 'ready' && current.dataSetId) {
          resolve(false)
          return current
        }
        if (current.status === 'initializing') {
          resolve(false)
          return current
        }
        resolve(true)
        return current
      })
    })

    if (!shouldProceed) {
      return new Promise<bigint | null>((resolve) => {
        setDataSet((current) => {
          resolve(current.dataSetId ?? null)
          return current
        })
      })
    }

    isCheckingDataSetRef.current = true

    try {
      const urlDataSetId = debugParams?.dataSetId ?? null
      const hasUrlOverrides = urlDataSetId !== null

      const storedDataSetId = hasUrlOverrides ? null : getStoredDataSetId(walletAddress)

      const effectiveDataSetId = urlDataSetId ?? storedDataSetId

      if (effectiveDataSetId !== null) {
        const bigIntId = BigInt(effectiveDataSetId)
        setDataSet({ status: 'ready', dataSetId: bigIntId })
        return bigIntId
      }

      // No stored data set found - return null, upload will create one
      setDataSet({ status: 'ready', dataSetId: null })
      return null
    } catch (error) {
      console.error('[DataSet] Failed to check data set:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to check data set'
      setDataSet({ status: 'error', error: errorMessage })
      return null
    } finally {
      isCheckingDataSetRef.current = false
    }
  }, [walletAddress, synapse, debugParams])

  const setDataSetId = useCallback((id: bigint) => {
    setDataSet({ status: 'ready', dataSetId: id })
  }, [])

  return {
    dataSet,
    checkIfDatasetExists,
    setDataSetId,
  }
}
