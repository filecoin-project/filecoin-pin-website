import { useCallback, useEffect, useRef } from 'react'

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
 * Hook to poll IPNI (cid.contact) with exponential backoff to verify CID availability
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
      const response = await fetch(`https://cid.contact/cid/${currentCid}`)
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
        onSuccessRef.current()
        return
      }

      // Check if we've exceeded max attempts
      if (attemptRef.current >= maxAttempts) {
        console.debug(`[IpniCheck] Max attempts (${maxAttempts}) reached for CID ${cid}`)
        isCheckingRef.current = false
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
    console.debug('[IpniCheck] useEffect triggered:', { isActive, cid, hasCid: !!cid })
    if (isActive && cid) {
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
