/**
 * LocalStorage helpers for managing data set IDs scoped per wallet address.
 *
 * Why scope to wallet address?
 * ----------------------------
 * Data sets in Synapse are wallet-specific - each data set is created by and
 * belongs to a specific wallet address. By scoping data set IDs to wallet addresses,
 * we ensure:
 *
 * 1. **Multi-wallet support**: Users can switch between different wallets, and each
 *    wallet will have its own data set ID stored separately.
 *
 * 2. **Data integrity**: We prevent accidentally using a data set that was created
 *    with a different wallet, which would cause authorization errors or failed uploads.
 *
 * 3. **User isolation**: In scenarios where multiple users share the same browser
 *    (e.g., shared computers, testing), each wallet maintains its own data set.
 *
 * Storage format: `filecoin-pin-data-set-id-{version}-{walletAddress}` → `{dataSetId}`
 */

const DATA_SET_ID_KEY = 'filecoin-pin-data-set-id-v2'
const DATA_SET_IDS_KEY = 'filecoin-pin-data-set-ids-v1'

const getDataSetIdsKey = (walletAddress: string): string => `${DATA_SET_IDS_KEY}-${walletAddress}`

/**
 * Get the storage key for a given wallet and optional provider.
 *
 * @param walletAddress - The wallet address
 * @param providerId - Optional provider ID for provider-specific keys
 * @returns The localStorage key string
 */
const getDataSetStorageKey = (walletAddress: string, providerId?: number): string => {
  if (providerId) {
    return `${DATA_SET_ID_KEY}-${walletAddress}-provider-${providerId}`
  }
  return `${DATA_SET_ID_KEY}-${walletAddress}`
}

/**
 * Get the stored data set ID for a specific wallet address.
 *
 * @param walletAddress - The wallet address to look up the data set ID for
 * @returns The data set ID if found, null otherwise
 */
export const getStoredDataSetId = (walletAddress: string): number | null => {
  try {
    const key = getDataSetStorageKey(walletAddress)
    const storedId = localStorage.getItem(key)
    console.debug('[DataSetStorage] Reading from key:', key, '→', storedId || 'not found')
    return storedId ? Number.parseInt(storedId, 10) : null
  } catch (error) {
    console.warn('[DataSetStorage] Failed to read data set ID from localStorage:', error)
    return null
  }
}

/**
 * Store the data set ID for a specific wallet address.
 *
 * @param walletAddress - The wallet address to associate with this data set ID
 * @param dataSetId - The data set ID to store
 */
export const storeDataSetId = (walletAddress: string, dataSetId: number): void => {
  try {
    const key = getDataSetStorageKey(walletAddress)
    localStorage.setItem(key, dataSetId.toString())
    console.debug('[DataSetStorage] Stored dataSetId:', dataSetId, 'to key:', key)
  } catch (error) {
    console.warn('[DataSetStorage] Failed to store data set ID in localStorage:', error)
  }
}

/**
 * Get all stored data set IDs for a wallet (multi-copy aware).
 *
 * Reads the v1 multi-id list. Falls back to the legacy single-id key for
 * existing users so their history is preserved across the upgrade.
 */
export const getStoredDataSetIds = (walletAddress: string): number[] => {
  try {
    const raw = localStorage.getItem(getDataSetIdsKey(walletAddress))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      }
    }
    const legacy = getStoredDataSetId(walletAddress)
    return legacy == null ? [] : [legacy]
  } catch (error) {
    console.warn('[DataSetStorage] Failed to read data set IDs from localStorage:', error)
    return []
  }
}

/**
 * Add a data set ID to the wallet's stored set. Idempotent.
 * Also keeps the legacy single-id key in sync (set to the most recent id).
 */
export const addStoredDataSetId = (walletAddress: string, dataSetId: number): void => {
  try {
    const current = new Set(getStoredDataSetIds(walletAddress))
    if (current.has(dataSetId)) return
    current.add(dataSetId)
    localStorage.setItem(getDataSetIdsKey(walletAddress), JSON.stringify([...current]))
    storeDataSetId(walletAddress, dataSetId)
  } catch (error) {
    console.warn('[DataSetStorage] Failed to add data set ID to localStorage:', error)
  }
}

/**
 * Get the stored data set ID for a specific wallet address and provider ID.
 *
 * This allows testing/debugging with different providers by storing separate
 * data sets per wallet+provider combination.
 *
 * @param walletAddress - The wallet address to look up the data set ID for
 * @param providerId - The provider ID to scope the data set to
 * @returns The data set ID if found, null otherwise
 */
export const getStoredDataSetIdForProvider = (walletAddress: string, providerId: number): number | null => {
  try {
    const key = getDataSetStorageKey(walletAddress, providerId)
    const storedId = localStorage.getItem(key)
    console.debug('[DataSetStorage] Reading from key:', key, '→', storedId || 'not found')
    return storedId ? Number.parseInt(storedId, 10) : null
  } catch (error) {
    console.warn('[DataSetStorage] Failed to read data set ID from localStorage:', error)
    return null
  }
}

/**
 * Store the data set ID for a specific wallet address and provider ID.
 *
 * This allows testing/debugging with different providers by storing separate
 * data sets per wallet+provider combination.
 *
 * @param walletAddress - The wallet address to associate with this data set ID
 * @param providerId - The provider ID to scope the data set to
 * @param dataSetId - The data set ID to store
 */
export const storeDataSetIdForProvider = (walletAddress: string, providerId: number, dataSetId: number): void => {
  try {
    const key = getDataSetStorageKey(walletAddress, providerId)
    localStorage.setItem(key, dataSetId.toString())
    console.debug('[DataSetStorage] Stored dataSetId:', dataSetId, 'to key:', key)
  } catch (error) {
    console.warn('[DataSetStorage] Failed to store data set ID in localStorage:', error)
  }
}
