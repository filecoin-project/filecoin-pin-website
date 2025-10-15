import { selectRandomSP } from './known-good-sps.ts'

/**
 * Debug/testing utilities for URL parameters.
 *
 * These are NOT intended for end users, but for developers and testers
 * to reproduce specific scenarios with predictable URLs.
 *
 * Supported parameters:
 * - `providerId`: Specify a storage provider ID to use. When set, the system will:
 *                 - Check for a data set in localStorage for this wallet+provider combination
 *                 - If found, reconnect to that data set
 *                 - If not found, create a new data set with this provider
 *                 - Store the data set ID separately for this wallet+provider pair
 *                 When NOT set, a random storage provider from the known-good list will be selected.
 * - `dataSetId`: Specify a data set ID to use (instead of localStorage or creating new)
 *
 * Examples:
 * - Test with specific provider: https://pin.filecoin.cloud/?providerId=123
 *   (Creates/connects to a data set for provider 123, separate from your default data set)
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

/**
 * Parse debug parameters from URL query string.
 * If no providerId is specified in the URL, a random storage provider
 * from the known-good list will be selected.
 *
 * @returns Object with providerId and dataSetId (null if not provided or invalid)
 */
export function getDebugParams(): DebugParams {
  const params = new URLSearchParams(window.location.search)

  const providerIdParam = params.get('providerId')
  const dataSetId = params.get('dataSetId')

  // Use URL providerId if present, otherwise select a random known-good SP
  const providerId = providerIdParam ? Number.parseInt(providerIdParam, 10) || null : selectRandomSP()

  return {
    providerId,
    dataSetId: dataSetId ? Number.parseInt(dataSetId, 10) || null : null,
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
