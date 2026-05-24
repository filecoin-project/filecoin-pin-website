import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDebugParams } from './debug-params.ts'

const UNSAFE_INTEGER_PROVIDER_ID = '9007199254740993'

describe('getDebugParams providerId', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.stubGlobal('location', { ...originalLocation, search: '' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const setSearch = (search: string) => {
    vi.stubGlobal('location', { ...originalLocation, search })
  }

  it('returns null when providerId is absent', () => {
    setSearch('')
    expect(getDebugParams().providerId).toBeNull()
  })

  it('parses providerId as bigint without Number precision loss', () => {
    setSearch(`?providerId=${UNSAFE_INTEGER_PROVIDER_ID}`)
    expect(getDebugParams().providerId).toBe(BigInt(UNSAFE_INTEGER_PROVIDER_ID))
  })

  it('returns null for invalid providerId values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(vi.fn())

    setSearch('?providerId=abc')
    expect(getDebugParams().providerId).toBeNull()

    setSearch('?providerId=0')
    expect(getDebugParams().providerId).toBeNull()

    setSearch('?providerId=-5')
    expect(getDebugParams().providerId).toBeNull()

    setSearch('?providerId=')
    expect(getDebugParams().providerId).toBeNull()

    warn.mockRestore()
  })
})
