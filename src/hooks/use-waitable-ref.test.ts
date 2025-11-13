import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useWaitableRef } from './use-waitable-ref.ts'

describe('useWaitableRef', () => {
  describe('Initial Resolution Scenarios', () => {
    it('should resolve immediately when value is non-null on first render', async () => {
      const { result } = renderHook(() => useWaitableRef('initial-value'))

      const value = await result.current.wait()
      expect(value).toBe('initial-value')
    })

    it('should return pending promise when value is null on first render', async () => {
      const { result, rerender } = renderHook(({ value }) => useWaitableRef(value), {
        initialProps: { value: null as string | null },
      })

      const waitPromise = result.current.wait()

      // Promise should be pending (we'll resolve it to verify)
      rerender({ value: 'resolved-value' })
      const value = await waitPromise
      expect(value).toBe('resolved-value')
    })
  })

  describe('Value Becomes Available Later', () => {
    it('should resolve when value transitions from null to non-null', async () => {
      const { result, rerender } = renderHook(({ value }) => useWaitableRef(value), {
        initialProps: { value: null as string | null },
      })

      const waitPromise = result.current.wait()
      rerender({ value: 'updated-value' })

      const value = await waitPromise
      expect(value).toBe('updated-value')
    })

    it('should return the same promise for multiple wait() calls before resolution', async () => {
      const { result, rerender } = renderHook(({ value }) => useWaitableRef(value), {
        initialProps: { value: null as string | null },
      })

      const promise1 = result.current.wait()
      const promise2 = result.current.wait()

      // Promises should be identical (same reference)
      expect(promise1).toBe(promise2)

      rerender({ value: 'resolved' })
      const [value1, value2] = await Promise.all([promise1, promise2])
      expect(value1).toBe('resolved')
      expect(value2).toBe('resolved')
    })
  })

  describe('Value Becomes Null Again Later', () => {
    it('should handle non-null → null → non-null transitions correctly', async () => {
      const { result, rerender } = renderHook(({ value }) => useWaitableRef(value), {
        initialProps: { value: 'valueA' as string | null },
      })

      // First resolution should be immediate
      const valueA = await result.current.wait()
      expect(valueA).toBe('valueA')

      // Value becomes null
      rerender({ value: null })

      // New wait should create new pending promise
      const waitPromise = result.current.wait()

      // Value becomes non-null again with different value
      rerender({ value: 'valueB' })

      const valueB = await waitPromise
      expect(valueB).toBe('valueB')
    })

    it('should create a new promise after value resets to null', async () => {
      const { result, rerender } = renderHook(({ value }) => useWaitableRef(value), {
        initialProps: { value: 'initial' as string | null },
      })

      const promise1 = result.current.wait()

      // Value becomes null
      rerender({ value: null })

      // New promise should be different
      const promise2 = result.current.wait()
      expect(promise1).not.toBe(promise2)
    })
  })

  describe('Multiple Waiters After Resolution', () => {
    it('should return already-resolved promise when calling wait() after resolution', async () => {
      const { result } = renderHook(() => useWaitableRef('value'))

      // First wait
      const value1 = await result.current.wait()
      expect(value1).toBe('value')

      // Second wait after resolution should also resolve immediately
      const value2 = await result.current.wait()
      expect(value2).toBe('value')
    })
  })

  describe('Promise Identity Lifecycle', () => {
    it('should maintain stable promise identity before resolution', async () => {
      const { result, rerender } = renderHook(({ value }) => useWaitableRef(value), {
        initialProps: { value: null as string | null },
      })

      const promise1 = result.current.wait()
      const promise2 = result.current.wait()
      const promise3 = result.current.wait()

      expect(promise1).toBe(promise2)
      expect(promise2).toBe(promise3)

      rerender({ value: 'resolved' })
      await promise1
    })

    it('should change promise identity after value resets to null', async () => {
      const { result, rerender } = renderHook(({ value }) => useWaitableRef(value), {
        initialProps: { value: 'initial' as string | null },
      })

      await result.current.wait()

      rerender({ value: null })
      const promiseBeforeReset = result.current.wait()

      rerender({ value: 'after-reset' })
      await promiseBeforeReset

      rerender({ value: null })
      const promiseAfterReset = result.current.wait()

      expect(promiseBeforeReset).not.toBe(promiseAfterReset)
    })
  })

  describe('Ordering and Race Conditions', () => {
    it('should handle resolve-before-wait scenario', async () => {
      const { result } = renderHook(() => useWaitableRef('already-available'))

      // Value is available before wait() is called
      const value = await result.current.wait()
      expect(value).toBe('already-available')
    })

    it('should handle wait-before-resolve scenario', async () => {
      const { result, rerender } = renderHook(({ value }) => useWaitableRef(value), {
        initialProps: { value: null as string | null },
      })

      // Wait before value is available
      const waitPromise = result.current.wait()

      // Then value becomes available
      rerender({ value: 'resolved-after-wait' })

      const value = await waitPromise
      expect(value).toBe('resolved-after-wait')
    })
  })

  describe('Object Reference Identity', () => {
    it('should preserve object reference identity', async () => {
      const objectValue = { foo: 'bar' }
      const { result } = renderHook(() => useWaitableRef(objectValue))

      const value = await result.current.wait()
      expect(value).toBe(objectValue)
    })
  })
})
