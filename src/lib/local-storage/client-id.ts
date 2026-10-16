/**
 * Per-browser client identity.
 *
 * We inject this `clientId` as data-set-level metadata at upload time. Synapse
 * smart-select matches data sets by *exact* metadata equality, so a unique
 * clientId forces this browser into its OWN data set (created on first upload,
 * reused afterwards) and never matches anyone else's.
 */

const CLIENT_ID_KEY = 'filecoin-pin-client-id'

/**
 * Return this browser's stable client id, creating one on first use.
 *
 * The first time a client id is created we also drop any legacy (shared) data
 * set ids so the history view stops loading datasets that predate per-browser
 * isolation.
 */
export const getOrCreateClientId = (): string => {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY)
    if (existing) return existing

    const id = crypto.randomUUID()
    localStorage.setItem(CLIENT_ID_KEY, id)
    try {
      clearLegacyDataSetIds()
    } catch (error) {
      console.warn('[ClientId] Failed to clear legacy data set ids:', error)
    }
    return id
  } catch (error) {
    console.warn('[ClientId] Falling back to ephemeral client id:', error)
    return crypto.randomUUID()
  }
}

/** Remove all previously-stored (shared) data set id keys. One-time migration. */
const clearLegacyDataSetIds = (): void => {
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.includes('filecoin-pin-data-set-id') && !/\d+:0x[0-9a-f]{40}/i.test(key)) {
      toRemove.push(key)
    }
  }
  for (const key of toRemove) {
    localStorage.removeItem(key)
  }
  if (toRemove.length > 0) {
    console.debug('[ClientId] Cleared legacy shared data set ids:', toRemove.join(', '))
  }
}
