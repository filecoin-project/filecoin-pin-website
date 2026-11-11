import { expect, it } from 'vitest'
import { describeFileAccessError, isWalletRequestCancelled } from './file-access-error.ts'

it('recognizes a rejection nested inside library errors', () => {
  const rejected = Object.assign(new Error('Request rejected'), { code: 4001 })
  expect(
    isWalletRequestCancelled(new Error('Signing failed', { cause: new Error('RPC failed', { cause: rejected }) }))
  ).toBe(true)
  expect(isWalletRequestCancelled(Object.assign(new Error('Rejected'), { name: 'UserRejectedRequestError' }))).toBe(
    true
  )
})
it('does not infer cancellation from network failures or message text', () => {
  expect(describeFileAccessError(new TypeError('Failed to fetch'), 'download')).toEqual({
    cancelled: false,
    message: 'Failed to fetch',
  })
  expect(isWalletRequestCancelled(new Error('User rejected something'))).toBe(false)
})
it('handles cyclic and unknown errors safely', () => {
  const cyclic: { cause?: unknown } = {}
  cyclic.cause = cyclic
  expect(isWalletRequestCancelled(cyclic)).toBe(false)
  expect(isWalletRequestCancelled(null)).toBe(false)
})
it.each(['download', 'preview', 'share'] as const)('provides a neutral cancellation explanation for %s', (action) => {
  const result = describeFileAccessError({ code: 4001 }, action)
  expect(result.cancelled).toBe(true)
  expect(result.message).toMatch(/cancelled.*wallet/i)
})
