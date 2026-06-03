/**
 * Per-browser client identity.
 *
 * The demo runs on a single shared wallet, so without a discriminator every
 * visitor's uploads land in the same Synapse data set(s) (matched by the
 * default `source` / `withIPFSIndexing` metadata). That makes the history view
 * show other users' files and makes it enumerate hundreds of pieces on load.
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
    let id = localStorage.getItem(CLIENT_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(CLIENT_ID_KEY, id)
      clearLegacyDataSetIds()
    }
    return id
  } catch (error) {
    // localStorage/crypto unavailable (e.g. SSR or locked-down browser):
    // fall back to an ephemeral id so uploads still get their own data set.
    console.warn('[ClientId] Falling back to ephemeral client id:', error)
    return crypto.randomUUID()
  }
}

/** Remove all previously-stored (shared) data set id keys. One-time migration. */
const clearLegacyDataSetIds = (): void => {
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.includes('filecoin-pin-data-set-id')) {
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
