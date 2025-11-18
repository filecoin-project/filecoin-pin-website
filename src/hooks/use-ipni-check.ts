import { type WaitForIpniProviderResultsOptions, waitForIpniProviderResults } from 'filecoin-pin/core/utils'
import { CID } from 'multiformats/cid'
import { useEffect, useRef } from 'react'

// Session-scoped cache to prevent repeated IPNI checks per CID within a page session.
// Value indicates the last known result of the IPNI listing check; "pending" marks an in-flight request.
const ipniSessionResultByCid: Map<string, 'success' | 'failed' | 'pending'> = new Map()

// LocalStorage helpers for success-only persistence across tabs/sessions
const LS_SUCCESS_PREFIX = 'ipni-check-success-v1:'

function getLocalStorageSuccess(cid: string): boolean {
  try {
    const key = `${LS_SUCCESS_PREFIX}${cid}`
    return typeof window !== 'undefined' && window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

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

interface UseIpniCheckOptions {
  cid: string | null
  isActive: boolean
  onSuccess: () => void
  onError?: (error: Error) => void
  waitForIpniProviderResultsOptions?: WaitForIpniProviderResultsOptions
}

/**
 * Hook to check IPNI cache for CID availability.
 *
 * Note: filecoin-pin now handles IPNI checking, so this hook only provides
 * caching functionality. It checks session cache and localStorage cache,
 * and calls the appropriate callbacks if cached results are found.
 *
 * To cache a result, call `cacheIpniResult` with the CID and result.
 */
export const useIpniCheck = ({
  cid,
  isActive,
  onSuccess,
  onError,
  waitForIpniProviderResultsOptions,
}: UseIpniCheckOptions) => {
  // Store callbacks in refs to prevent them from being recreated
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)

  // Update refs when callbacks change
  useEffect(() => {
    onSuccessRef.current = onSuccess
    onErrorRef.current = onError
  }, [onSuccess, onError])

  // Check cache when isActive becomes true
  useEffect(() => {
    if (isActive && cid) {
      let cidInstance: CID
      try {
        cidInstance = CID.parse(cid)
      } catch (err) {
        console.error('[IpniCheck] Invalid CID:', err)
        onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)))
        return
      }
      // If we've already checked this CID in the current page session, reuse the result and skip checking
      const prior = ipniSessionResultByCid.get(cid)
      if (prior === 'success') {
        console.debug('[IpniCheck] Session cache hit (success) for CID:', cid)
        if (!getLocalStorageSuccess(cid)) {
          setLocalStorageSuccess(cid)
        }
        onSuccessRef.current()
        return
      }
      if (prior === 'failed') {
        console.debug('[IpniCheck] Session cache hit (failed) for CID:', cid)
        return
      }
      if (prior === 'pending') return

      // Check cross-tab/session success cache in localStorage
      if (getLocalStorageSuccess(cid)) {
        console.debug('[IpniCheck] LocalStorage cache hit (success) for CID:', cid)
        ipniSessionResultByCid.set(cid, 'success')
        onSuccessRef.current()
        return
      }

      // No cached result found - use waitForIpniProviderResults to check if the CID has a provider result on an ipni indexer
      ipniSessionResultByCid.set(cid, 'pending')
      console.debug('[IpniCheck] No cache found for CID:', cid, '- filecoin-pin will handle checking')
      waitForIpniProviderResults(cidInstance, waitForIpniProviderResultsOptions)
        .then(() => {
          cacheIpniResult(cid, 'success')
          onSuccessRef.current?.()
        })
        .catch((error) => {
          console.error('[IpniCheck] IPNI check failed:', error)
          cacheIpniResult(cid, 'failed')
          onErrorRef.current?.(error)
        })
    }
  }, [isActive, cid, waitForIpniProviderResultsOptions])
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
