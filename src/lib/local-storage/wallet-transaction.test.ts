import { expect, it } from 'vitest'
import { readWalletTransaction, saveWalletTransaction } from './wallet-transaction.ts'

const scope = `314:0x${'1'.repeat(40)}`
const hash = `0x${'a'.repeat(64)}` as const
const pending = { hash, kind: 'deposit' as const, submittedAt: 1 }
const messageCid = 'bafy2bzacea3wsdh6y3a36tb3skempjoxqpuyompjbmfeyf34fi3uy6uue42v4'

it('restores pending work with its original message CID', () => {
  saveWalletTransaction(scope, { ...pending, messageCid })
  expect(readWalletTransaction(scope)).toEqual({ ...pending, messageCid })
})

it('retains older pending transactions while discarding obsolete nonce recovery data', () => {
  localStorage.setItem(
    `filecoin-drive-wallet-transaction-${scope}`,
    JSON.stringify({ ...pending, recovery: { nonce: 7 } })
  )
  expect(readWalletTransaction(scope)).toEqual(pending)
})

it('retains the hash when a stored message CID is malformed', () => {
  saveWalletTransaction(scope, { ...pending, messageCid: 'not-a-cid' })
  expect(readWalletTransaction(scope)).toEqual(pending)
})
