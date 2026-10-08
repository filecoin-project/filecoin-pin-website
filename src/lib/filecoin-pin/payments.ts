import type { Synapse } from '@filoz/synapse-sdk'
import { checkAllowances } from 'filecoin-pin/core/payments'
import { type Hash, maxUint256 } from 'viem'

async function confirm(synapse: Synapse, hash: Hash) {
  const receipt = await synapse.client.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('Payment transaction reverted. Your setup has not changed.')
  return hash
}

export async function depositStorageFunds(synapse: Synapse, amount: bigint) {
  if (amount <= 0n) throw new Error('Enter a positive USDFC amount')
  // Deposit only: the convenience depositUSDFC helper can also grant unlimited
  // FWSS approval, which belongs to the separate, explicitly consented action.
  const hash = await synapse.payments.depositWithPermit({ amount })
  return confirm(synapse, hash)
}

export async function approveStoragePayments(synapse: Synapse) {
  if (!(await checkAllowances(synapse)).needsUpdate) return null
  const hash = await synapse.payments.approveService({
    service: synapse.chain.contracts.fwss.address,
    rateAllowance: maxUint256,
    lockupAllowance: maxUint256,
  })
  return confirm(synapse, hash)
}
