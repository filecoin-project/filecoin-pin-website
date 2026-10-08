import type { Synapse } from '@filoz/synapse-sdk'
import { maxUint256 } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { allowances } = vi.hoisted(() => ({ allowances: vi.fn() }))
vi.mock('filecoin-pin/core/payments', () => ({ checkAllowances: allowances }))

import { approveStoragePayments, depositStorageFunds } from './payments.ts'

const hash = `0x${'a'.repeat(64)}`
const deposit = vi.fn()
const approve = vi.fn()
const receipt = vi.fn()
const synapse = {
  payments: { depositWithPermit: deposit, approveService: approve },
  chain: { contracts: { fwss: { address: '0x1111111111111111111111111111111111111111' } } },
  client: { waitForTransactionReceipt: receipt },
} as unknown as Synapse
beforeEach(() => {
  vi.resetAllMocks()
  deposit.mockResolvedValue(hash)
  approve.mockResolvedValue(hash)
  receipt.mockResolvedValue({ status: 'success' })
  allowances.mockResolvedValue({ needsUpdate: true })
})
describe('explicit owner payment actions', () => {
  it('deposits the exact amount without granting operator approval', async () => {
    await depositStorageFunds(synapse, 123n)
    expect(deposit).toHaveBeenCalledWith({ amount: 123n })
    expect(approve).not.toHaveBeenCalled()
    expect(allowances).not.toHaveBeenCalled()
    expect(receipt).toHaveBeenCalledWith({ hash })
  })
  it('rejects nonpositive deposits before asking the wallet to sign', async () => {
    await expect(depositStorageFunds(synapse, 0n)).rejects.toThrow('positive')
    expect(deposit).not.toHaveBeenCalled()
  })
  it('grants storage allowances only through the separate approval action', async () => {
    await approveStoragePayments(synapse)
    expect(approve).toHaveBeenCalledWith({
      service: synapse.chain.contracts.fwss.address,
      rateAllowance: maxUint256,
      lockupAllowance: maxUint256,
    })
    expect(deposit).not.toHaveBeenCalled()
  })
  it('does not submit a redundant approval when chain permissions are already sufficient', async () => {
    allowances.mockResolvedValue({ needsUpdate: false })
    await approveStoragePayments(synapse)
    expect(approve).not.toHaveBeenCalled()
  })
  it.each(['deposit', 'approve'])('does not report a reverted %s as confirmed', async (action) => {
    receipt.mockResolvedValue({ status: 'reverted' })
    await expect(
      action === 'deposit' ? depositStorageFunds(synapse, 1n) : approveStoragePayments(synapse)
    ).rejects.toThrow('reverted')
  })
})
