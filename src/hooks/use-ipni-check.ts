// Session-scoped cache of IPNI check results, keyed by CID.
const ipniSessionResultByCid: Map<string, 'success' | 'failed'> = new Map()

// LocalStorage helpers for success-only persistence across tabs/sessions
const LS_SUCCESS_PREFIX = 'ipni-check-success-v1:'

function setLocalStorageSuccess(cid: string): void {
  try {
    const key = `${LS_SUCCESS_PREFIX}${cid}`
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, '1')
    }
  } catch {
    // ignore storage write errors (quota/disabled/private mode)
  }
}

/**
 * Cache an IPNI check result for a CID.
 * This should be called when filecoin-pin reports IPNI advertisement results.
 */
export function cacheIpniResult(cid: string, result: 'success' | 'failed'): void {
  ipniSessionResultByCid.set(cid, result)
  if (result === 'success') {
    setLocalStorageSuccess(cid)
  }
}
