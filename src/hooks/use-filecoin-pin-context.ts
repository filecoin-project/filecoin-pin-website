import { useContext } from 'react'
import { FilecoinPinContext } from '../context/filecoin-pin-provider.tsx'

/**
 * Accessor hook for `FilecoinPinContext`.
 *
 * Centralizes the "must be used within provider" guard so other hooks
 * can focus on business logic instead of repeating boilerplate checks.
 *
 * @returns The current `FilecoinPinContext` value
 * @throws Error when used outside of `FilecoinPinProvider`
 */
export function useFilecoinPinContext() {
  const context = useContext(FilecoinPinContext)

  if (!context) {
    throw new Error('useFilecoinPinContext must be used within FilecoinPinProvider')
  }

  return context
}
