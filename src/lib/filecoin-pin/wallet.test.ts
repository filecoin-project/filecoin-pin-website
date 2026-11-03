import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPaymentStatusMock } = vi.hoisted(() => ({ getPaymentStatusMock: vi.fn() }))

vi.mock('filecoin-pin/core/payments', () => ({ getPaymentStatus: getPaymentStatusMock }))

import type { Synapse } from './synapse.ts'
import { fetchWalletSnapshot } from './wallet.ts'

const status = (network: string) => ({
  network,
  chainId: 314159,
  address: '0xabc',
  filBalance: 1_234_000_000_000_000_000n,
  walletUsdfcBalance: 5_678_000_000_000_000_000n,
  filecoinPayBalance: 0n,
  currentAllowances: {},
})

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
