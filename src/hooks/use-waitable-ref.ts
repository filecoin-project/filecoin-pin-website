import { useCallback, useEffect, useRef } from 'react'

/**
 * Creates a ref that can be awaited until it has a value.
 *
 * This hook handles the common pattern of waiting for asynchronously-provided
 * context values (like provider info, storage contexts, or auth state) that may
 * not be immediately available when a component mounts or a callback is created.
 *
 * Key behaviors:
 * - Resolves immediately if value is already non-null when wait() is called
 * - Returns the same promise instance for multiple wait() calls during the same waiting cycle
 * - Handles null -> non-null -> null transitions correctly by creating a new promise per cycle
 * - Safe to use in useCallback dependencies due to stable wait() identity
 *
 * Edge cases handled:
 * - Values that become null again after being non-null (context resets, wallet disconnects)
 * - React Strict Mode double-mounting in development
 * - Values available before the first wait() call
 * - Multiple consumers waiting on the same value simultaneously
 *
 * @param value - The value to track, typically from a React context or async hook
 * @returns Object with ref (current value) and wait (async function to wait for value)
 *
 * @example
 * const storageContextRef = useWaitableRef(storageContext)
 * const providerInfoRef = useWaitableRef(providerInfo)
 *
 * const upload = useCallback(async () => {
 *   const [ctx, provider] = await Promise.all([
 *     storageContextRef.wait(),
 *     providerInfoRef.wait()
 *   ])
 *   // Both values guaranteed to be non-null here
 * }, [storageContextRef.wait, providerInfoRef.wait])
 */
export function useWaitableRef<T>(value: T | null) {
  const ref = useRef<T | null>(value)
  // Store the resolver function to call when value becomes available
  const resolver = useRef<((v: T) => void) | null>(null)
  // Store the promise to ensure wait() returns the same instance during a waiting cycle
  const promiseRef = useRef<Promise<T> | null>(null)

  useEffect(() => {
    ref.current = value

    if (value != null && resolver.current) {
      // Resolve any pending waiters with the new value
      resolver.current(value)
      // Clear resolver and promise to allow new waiting cycles if value goes null again
      // This is critical for handling context resets, reconnections, or wallet switches
      resolver.current = null
      promiseRef.current = null
    }
  }, [value])

  // Memoized to ensure stable identity for use in dependency arrays
  const wait = useCallback(() => {
    // Return existing promise if we're already waiting (ensures idempotency)
    if (promiseRef.current) return promiseRef.current

    // Fast path: value already available, resolve immediately
    // This handles the case where value exists before wait() is called
    if (ref.current != null) {
      return Promise.resolve(ref.current)
    }

    // Create new promise for this waiting cycle
    promiseRef.current = new Promise<T>((resolve) => {
      resolver.current = (v) => {
        // Clear resolver immediately to prevent double-resolution
        resolver.current = null
        resolve(v)
      }
    })

    return promiseRef.current
  }, [])

  return { ref, wait }
}
