import { useCallback, useEffect, useRef } from 'react'

// Session-scoped cache to prevent repeated IPNI checks per CID within a page session
// Value indicates the last known result of the IPNI listing check
const ipniSessionResultByCid: Map<string, 'success' | 'failed'> = new Map()

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
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
}

/**
 * Hook to poll IPNI (filecoinpin.contact) with exponential backoff to verify CID availability
 */
export const useIpniCheck = ({
  cid,
  isActive,
  onSuccess,
  onError,
  maxAttempts = 10,
  initialDelayMs = 1000,
  maxDelayMs = 30000,
}: UseIpniCheckOptions) => {
  const attemptRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isCheckingRef = useRef(false)

  // Store callbacks in refs to prevent pollWithBackoff from being recreated
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)

  // Update refs when callbacks change
  useEffect(() => {
    onSuccessRef.current = onSuccess
    onErrorRef.current = onError
  }, [onSuccess, onError])

  const checkIpni = useCallback(async (currentCid: string): Promise<boolean> => {
    try {
      const response = await fetch(`https://filecoinpin.contact/cid/${currentCid}`)
      console.debug(`[IpniCheck] Response for ${currentCid}:`, response.status, response.statusText)

      // Only consider 200 as successful (CID is actually indexed and available)
      // 404 means it's not indexed yet
      const isAvailable = response.ok && response.status === 200
      console.debug(`[IpniCheck] CID ${currentCid} available:`, isAvailable)
      return isAvailable
    } catch (error) {
      console.error('[IpniCheck] Error checking IPNI:', error)
      // Network errors, continue retrying
      return false
    }
  }, [])

  const pollWithBackoff = useCallback(async () => {
    if (!cid || !isActive || isCheckingRef.current) {
      return
    }

    console.debug('[IpniCheck] Starting IPNI polling for CID', cid)
    isCheckingRef.current = true
    attemptRef.current = 0

    const poll = async () => {
      if (!isActive || !cid) {
        isCheckingRef.current = false
        return
      }

      attemptRef.current += 1
      console.debug(`[IpniCheck] Attempt ${attemptRef.current}/${maxAttempts} for CID ${cid}`)

      const success = await checkIpni(cid)

      if (success) {
        isCheckingRef.current = false
        ipniSessionResultByCid.set(cid, 'success')
        setLocalStorageSuccess(cid)
        onSuccessRef.current()
        return
      }

      // Check if we've exceeded max attempts
      if (attemptRef.current >= maxAttempts) {
        console.debug(`[IpniCheck] Max attempts (${maxAttempts}) reached for CID ${cid}`)
        isCheckingRef.current = false
        ipniSessionResultByCid.set(cid, 'failed')
        onErrorRef.current?.(new Error(`IPNI check failed after ${maxAttempts} attempts`))
        return
      }

      // Calculate exponential backoff delay
      const delay = Math.min(initialDelayMs * 2 ** (attemptRef.current - 1), maxDelayMs)

      // Schedule next attempt
      timeoutRef.current = setTimeout(poll, delay)
    }

    // Start polling
    poll()
  }, [cid, isActive, checkIpni, maxAttempts, initialDelayMs, maxDelayMs])

  // Start polling when isActive becomes true
  useEffect(() => {
    if (isActive && cid) {
      // If we've already checked this CID in the current page session, reuse the result and skip polling
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
        onErrorRef.current?.(new Error('IPNI check previously failed in this session'))
        return
      }

      // Check cross-tab/session success cache in localStorage
      if (getLocalStorageSuccess(cid)) {
        console.debug('[IpniCheck] LocalStorage cache hit (success) for CID:', cid)
        ipniSessionResultByCid.set(cid, 'success')
        onSuccessRef.current()
        return
      }

      console.debug('[IpniCheck] Starting polling for CID:', cid)
      pollWithBackoff()
    }

    // Cleanup on unmount or when isActive becomes false
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      isCheckingRef.current = false
    }
  }, [isActive, cid, pollWithBackoff])

  // Reset when CID changes
  useEffect(() => {
    attemptRef.current = 0
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    isCheckingRef.current = false
  }, [cid])
}
