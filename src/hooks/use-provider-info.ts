import { useContext, useMemo } from 'react'
import { FilecoinPinContext } from '../context/filecoin-pin-provider.tsx'

export interface ProviderInfo {
  providerAddress: string
  providerName: string
  serviceURL: string
  datasetId: string
}

/**
 * Hook to access provider information from FilecoinPinContext.
 *
 * Provides a single source of truth for provider-related data,
 * eliminating the need to drill these props through component hierarchies.
 *
 * Returns null if the dataset is not ready yet, ensuring components
 * only receive fully valid provider data (no undefined checks needed).
 *
 * @returns Provider information or null if dataset not ready
 * @throws Error if used outside of FilecoinPinProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const providerInfo = useProviderInfo()
 *
 *   if (!providerInfo) {
 *     return <div>Loading provider info...</div>
 *   }
 *
 *   return <div>Provider: {providerInfo.providerName}</div>
 * }
 * ```
 */
export function useProviderInfo(): ProviderInfo | null {
  const context = useContext(FilecoinPinContext)

  if (!context) {
    throw new Error('useProviderInfo must be used within FilecoinPinProvider')
  }

  const { dataSet, providerInfo } = context

  return useMemo(() => {
    // Only return valid data when dataset is ready
    if (dataSet.status !== 'ready' || !providerInfo) {
      return null
    }

    return {
      providerAddress: providerInfo.serviceProvider,
      providerName: providerInfo.name,
      serviceURL: providerInfo.products?.PDP?.data?.serviceURL || '',
      datasetId: String(dataSet.dataSetId),
    }
  }, [dataSet, providerInfo])
}
