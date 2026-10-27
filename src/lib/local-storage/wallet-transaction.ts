import { CID } from 'multiformats/cid'
import type { Address, Hash } from 'viem'

export type WalletTransactionKind = 'authorize' | 'revoke' | 'deposit' | 'approve'
export interface WalletTransaction {
  hash: Hash
  kind: WalletTransactionKind
  submittedAt: number
  expiresAt?: number
  session?: { key: Address; revision?: string }
  messageCid?: string
}
const keyFor = (scope: string) => `filecoin-drive-wallet-transaction-${scope}`

export function readWalletTransaction(scope: string): WalletTransaction | null {
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(scope)) ?? 'null')
    if (
      !value ||
      !/^0x[0-9a-f]{64}$/i.test(value.hash) ||
      !['authorize', 'revoke', 'deposit', 'approve'].includes(value.kind) ||
      !Number.isFinite(value.submittedAt) ||
      (value.kind === 'authorize' && !Number.isFinite(value.expiresAt))
    )
      return null
    if (
      value.session &&
      (!/^0x[0-9a-f]{40}$/i.test(value.session.key) ||
        (value.session.revision !== undefined && typeof value.session.revision !== 'string'))
    )
      delete value.session
    if (value.messageCid !== undefined) {
      try {
        value.messageCid = CID.parse(value.messageCid).toString()
      } catch {
        delete value.messageCid
      }
    }
    // Older nonce-based recovery metadata is no longer used; retain the pending hash and operation.
    delete value.recovery
    return value
  } catch {
    return null
  }
}

export function saveWalletTransaction(scope: string, value: WalletTransaction | null) {
  if (value) localStorage.setItem(keyFor(scope), JSON.stringify(value))
  else localStorage.removeItem(keyFor(scope))
}
