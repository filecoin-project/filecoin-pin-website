import { useCallback, useRef, useState } from 'react'
import type { Synapse } from '../lib/filecoin-pin/synapse.ts'
import { getStoredDataSetIds } from '../lib/local-storage/data-set.ts'

export type DataSetState =
  | { status: 'idle'; dataSetIds?: bigint[] }
  | { status: 'initializing'; dataSetIds?: bigint[] }
  | { status: 'ready'; dataSetIds: bigint[] }
  | { status: 'error'; error: string; dataSetIds?: bigint[] }

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
  checkIfDatasetExists: () => Promise<bigint[]>
  addDataSetId: (id: bigint) => void
}

const dedupeBigInts = (ids: bigint[]): bigint[] => {
  const set = new Set<string>()
  const out: bigint[] = []
  for (const id of ids) {
    const k = id.toString()
    if (set.has(k)) continue
    set.add(k)
    out.push(id)
  }
  return out
}

/**
 * Tracks the set of data set IDs known for the active wallet so the history
 * view can fetch pieces from every dataset that participated in a multi-copy
 * upload (not just the most recent one).
 */
export function useDataSetManager({
  synapse,
  walletAddress,
  debugParams,
}: UseDataSetManagerProps): UseDataSetManagerReturn {
  const [dataSet, setDataSet] = useState<DataSetState>({ status: 'idle' })
  const isCheckingDataSetRef = useRef<boolean>(false)

  const checkIfDatasetExists = useCallback(async (): Promise<bigint[]> => {
    if (isCheckingDataSetRef.current) {
      return new Promise<bigint[]>((resolve) => {
        setDataSet((current) => {
          resolve(current.dataSetIds ?? [])
          return current
        })
      })
    }

    if (!walletAddress || !synapse) {
      return []
    }

    const shouldProceed = await new Promise<boolean>((resolve) => {
      setDataSet((current) => {
        if (current.status === 'ready' && (current.dataSetIds?.length ?? 0) > 0) {
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
      return new Promise<bigint[]>((resolve) => {
        setDataSet((current) => {
          resolve(current.dataSetIds ?? [])
          return current
        })
      })
    }

    isCheckingDataSetRef.current = true

    try {
      const urlDataSetId = debugParams?.dataSetId ?? null
      const hasUrlOverrides = urlDataSetId !== null

      const storedIds = hasUrlOverrides ? [] : getStoredDataSetIds(walletAddress)

      const effective = urlDataSetId === null ? storedIds : [urlDataSetId]

      const bigIntIds = effective.map((n) => BigInt(n))
      setDataSet({ status: 'ready', dataSetIds: bigIntIds })
      return bigIntIds
    } catch (error) {
      console.error('[DataSet] Failed to check data set:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to check data set'
      setDataSet({ status: 'error', error: errorMessage })
      return []
    } finally {
      isCheckingDataSetRef.current = false
    }
  }, [walletAddress, synapse, debugParams])

  const addDataSetId = useCallback((id: bigint) => {
    setDataSet((current) => {
      const existing = current.dataSetIds ?? []
      const next = dedupeBigInts([...existing, id])
      // No-op when the id is already known to avoid render thrash mid-upload
      if (next.length === existing.length) {
        return current.status === 'ready' ? current : { status: 'ready', dataSetIds: next }
      }
      return { status: 'ready', dataSetIds: next }
    })
  }, [])

  return {
    dataSet,
    checkIfDatasetExists,
    addDataSetId,
  }
}
