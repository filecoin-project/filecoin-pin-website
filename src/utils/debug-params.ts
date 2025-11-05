/**
 * Debug/testing utilities for URL parameters.
 *
 * These are NOT intended for end users, but for developers and testers
 * to reproduce specific scenarios with predictable URLs.
 *
 * Supported parameters:
 * - `providerId`: Specify a storage provider ID to force when establishing the storage context.
 *   When set, we reuse any matching data set cached in localStorage (wallet + provider pair);
 *   otherwise Synapse will automatically choose the provider during initialization.
 * - `dataSetId`: Specify a data set ID to use (instead of localStorage discovery)
 *
 * Examples:
 * - Test with specific provider: https://pin.filecoin.cloud/?providerId=123
 *   (Reconnects to a data set for provider 123, separate from your default data set)
 *
 * - Test with existing data set: https://pin.filecoin.cloud/?dataSetId=456
 *   (Connects to data set 456 directly)
 *
 * - Test specific provider + data set: https://pin.filecoin.cloud/?providerId=123&dataSetId=456
 *   (Connects to data set 456 using provider 123)
 *
 * Note: Provider-specific data sets are stored separately in localStorage, so you can test
 * multiple providers without losing your default data set.
 */

interface DebugParams {
  providerId: number | null
  dataSetId: number | null
}

const parseQueryParamNumber = (value: string | null): number | null => {
  if (value === null) {
    return null
  }

  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed)) {
    console.warn(`[DEBUG PARAMS] Invalid number: ${value}`)
    return null
  }

  return parsed
}

/**
 * Parse debug parameters from URL query string.
 * When no providerId is provided, Synapse will handle provider selection automatically.
 *
 * @returns Object with providerId and dataSetId (null if not provided or invalid)
 */
export function getDebugParams(): DebugParams {
  const params = new URLSearchParams(window.location.search)

  const providerIdParam = params.get('providerId')
  const dataSetId = params.get('dataSetId')

  // Use URL providerId if present, otherwise defer to Synapse for selection
  const providerId = parseQueryParamNumber(providerIdParam)

  return {
    providerId,
    dataSetId: parseQueryParamNumber(dataSetId),
  }
}

/**
 * Log debug parameters if any are set.
 * This helps developers understand when debug mode is active.
 */
export function logDebugParams(): void {
  const params = getDebugParams()

  if (params.providerId !== null || params.dataSetId !== null) {
    console.warn(
      '[DEBUG MODE] URL parameters detected:',
      params.providerId !== null ? `providerId=${params.providerId}` : '',
      params.dataSetId !== null ? `dataSetId=${params.dataSetId}` : ''
    )
  }
}
