import { beforeEach, expect, it } from 'vitest'
import { getOrCreateClientId } from './client-id.ts'

beforeEach(() => localStorage.clear())

it('migrates shared demo dataset references without removing wallet/network directories', () => {
  const scoped = 'filecoin-pin-data-set-ids-v1-314:0x1111111111111111111111111111111111111111'
  const legacy = 'filecoin-pin-data-set-id-v2-0x1111111111111111111111111111111111111111'
  localStorage.setItem(scoped, '[123]')
  localStorage.setItem(legacy, '456')
  const id = getOrCreateClientId()
  expect(localStorage.getItem(scoped)).toBe('[123]')
  expect(localStorage.getItem(legacy)).toBeNull()
  expect(getOrCreateClientId()).toBe(id)
})
