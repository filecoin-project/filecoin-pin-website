import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPaymentStatusMock } = vi.hoisted(() => ({ getPaymentStatusMock: vi.fn() }))

vi.mock('filecoin-pin/core/payments', () => ({ getPaymentStatus: getPaymentStatusMock }))

import { TIME_CONSTANTS } from '@filoz/synapse-core/utils'
import { LOW_STORAGE_RUNWAY_DAYS } from './config.ts'
import type { Synapse } from './synapse.ts'
import { fetchWalletSnapshot, storageFundsStatus } from './wallet.ts'

const status = (network: string) => ({
  network,
  chainId: network === 'calibration' ? 314159 : 314,
  address: '0xabc',
  filBalance: 1_234_000_000_000_000_000n,
  walletUsdfcBalance: 5_678_000_000_000_000_000n,
  filecoinPayBalance: 0n,
  currentAllowances: {},
})

it.each([
  ['needed', 0n, 0n, 1n, 0n],
  ['needed', 1n, 1n, 1n, 0n],
  ['low', 100n, 0n, 1n, 100n],
  ['available', 1n, 0n, 0n, 0n],
  ['available', 100n, 0n, 1n, BigInt(LOW_STORAGE_RUNWAY_DAYS) * TIME_CONSTANTS.EPOCHS_PER_DAY],
] as const)(
  'classifies %s funds from unreserved balance and current charges',
  (status, availableFunds, debt, lockupRatePerEpoch, runwayInEpochs) => {
    expect(storageFundsStatus({ availableFunds, debt, lockupRatePerEpoch, runwayInEpochs })).toBe(status)
  }
)

beforeEach(() => {
  sessionStorage.clear()
  getPaymentStatusMock.mockReset()
})

describe('fetchWalletSnapshot', () => {
  it('formats calibration balances for the header', async () => {
    getPaymentStatusMock.mockResolvedValue(status('calibration'))

    const snapshot = await fetchWalletSnapshot({} as Synapse)

    expect(snapshot.formatted).toEqual({ fil: '1.23 tFIL', usdfc: '5.68 tUSDFC' })
  })

  it('formats mainnet balances for the header', async () => {
    getPaymentStatusMock.mockResolvedValue(status('mainnet'))

    const snapshot = await fetchWalletSnapshot({} as Synapse)

    expect(snapshot.formatted).toEqual({ fil: '1.23 FIL', usdfc: '5.68 USDFC' })
  })
})
