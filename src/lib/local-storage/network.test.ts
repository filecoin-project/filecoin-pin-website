import { afterEach, expect, it, vi } from 'vitest'
import { readNetworkPreference } from './network.ts'

afterEach(() => vi.restoreAllMocks())

it('migrates only the network preference and leaves cached testnet data untouched', () => {
  localStorage.setItem('filecoin-drive-network', 'calibration')
  const key = 'filecoin-pin-piece-cache-v1-314159:0x1111111111111111111111111111111111111111'
  localStorage.setItem(key, '[{"id":"legacy-testnet-file"}]')
  expect(readNetworkPreference()).toBe('mainnet')
  expect(localStorage.getItem('filecoin-drive-network')).toBe('mainnet')
  expect(localStorage.getItem(key)).toBe('[{"id":"legacy-testnet-file"}]')
})

it('uses Mainnet even when persisting the migration fails', () => {
  localStorage.setItem('filecoin-drive-network', 'calibration')
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Storage full')
  })
  expect(readNetworkPreference()).toBe('mainnet')
  expect(localStorage.getItem('filecoin-drive-network')).toBe('calibration')
})

it.each([null, 'mainnet', 'unknown'])('defaults to Mainnet for saved value %s without rewriting storage', (saved) => {
  if (saved !== null) localStorage.setItem('filecoin-drive-network', saved)
  const write = vi.spyOn(localStorage, 'setItem')
  expect(readNetworkPreference()).toBe('mainnet')
  expect(write).not.toHaveBeenCalled()
})

it('uses Mainnet when reading browser storage fails', () => {
  vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
    throw new Error('Storage blocked')
  })
  expect(readNetworkPreference()).toBe('mainnet')
})
