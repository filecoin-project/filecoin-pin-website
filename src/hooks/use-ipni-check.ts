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

  const checkIpni = useCallback(async (currentCid: string): Promise<boolean> => {
    try {
      const response = await fetch(`https://cid.contact/cid/${currentCid}`)
      // Consider 200 or 404 as successful responses (CID is indexed)
      // 404 might mean it's indexed but has no providers yet
      return response.ok && response.status !== 404
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

    isCheckingRef.current = true
    attemptRef.current = 0

    const poll = async () => {
      if (!isActive || !cid) {
        isCheckingRef.current = false
        return
      }

      attemptRef.current += 1

      const success = await checkIpni(cid)

      if (success) {
        isCheckingRef.current = false
        onSuccess()
        return
      }

      // Check if we've exceeded max attempts
      if (attemptRef.current >= maxAttempts) {
        isCheckingRef.current = false
        onError?.(new Error(`IPNI check failed after ${maxAttempts} attempts`))
        return
      }

      // Calculate exponential backoff delay
      const delay = Math.min(initialDelayMs * 2 ** (attemptRef.current - 1), maxDelayMs)

      // Schedule next attempt
      timeoutRef.current = setTimeout(poll, delay)
    }

    // Start polling
    poll()
  }, [cid, isActive, checkIpni, onSuccess, onError, maxAttempts, initialDelayMs, maxDelayMs])

  // Start polling when isActive becomes true
  useEffect(() => {
    if (isActive && cid) {
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
