import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address, Hash, TransactionReceipt } from 'viem'
import { type DriveNetwork, publicClient, scopeFor } from '../lib/filecoin-pin/browser-wallet.ts'
import {
  readWalletTransaction,
  saveWalletTransaction,
  type WalletTransaction,
  type WalletTransactionKind,
} from '../lib/local-storage/wallet-transaction.ts'

const CHECK_INTERVAL = 30_000
const AUTO_CHECK_WINDOW = 10 * 60_000
export class PendingWalletTransactionError extends Error {}

/** A missing receipt or RPC failure leaves the original transaction unresolved. */
export function useWalletTransaction(
  address: Address | null,
  network: DriveNetwork,
  busy: boolean,
  reconcile: (transaction: WalletTransaction) => Promise<boolean>,
  onConfirmed: (transaction: WalletTransaction) => Promise<void>
) {
  const scope = address ? scopeFor(address, network) : ''
  const [record, setRecord] = useState<{ scope: string; transaction: WalletTransaction } | null>(null)
  const pending = record?.scope === scope ? record.transaction : null
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const identity = useRef(scope)
  identity.current = scope

  useEffect(() => {
    setError(null)
    const transaction = scope ? readWalletTransaction(scope) : null
    setRecord(transaction ? { scope, transaction } : null)
  }, [scope])

  const finish = useCallback(
    async (targetScope: string, transaction: WalletTransaction, success: boolean) => {
      if (identity.current !== targetScope) return
      if (success) await onConfirmed(transaction)
      saveWalletTransaction(targetScope, null)
      if (identity.current !== targetScope) return
      setRecord(null)
      setError(success ? null : 'Transaction reverted. You can try the operation again.')
      setRevision((value) => value + 1)
    },
    [onConfirmed]
  )

  useEffect(() => {
    if (!pending || busy) return
    let cancelled = false
    let running = false
    const check = async () => {
      if (cancelled || running || document.visibilityState === 'hidden') return
      running = true
      setChecking(true)
      try {
        let success: boolean | undefined
        try {
          const receipt = await publicClient(network).getTransactionReceipt({ hash: pending.hash })
          success = receipt.status === 'success'
        } catch {
          // Not found, connection failures and replaced hashes are not proof of failure.
        }
        if (success === undefined && (await reconcile(pending))) success = true
        if (!cancelled && success !== undefined) await finish(scope, pending, success)
      } catch {
        // Preserve the hash and allow later reads to recover, including storage errors.
      } finally {
        running = false
        if (!cancelled) setChecking(false)
      }
    }
    void check()
    const timer = window.setInterval(() => {
      if (Date.now() - pending.submittedAt < AUTO_CHECK_WINDOW) void check()
    }, CHECK_INTERVAL)
    const resume = () => {
      void check()
    }
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)
    document.addEventListener('visibilitychange', resume)
    document.addEventListener('resume', resume)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
      document.removeEventListener('visibilitychange', resume)
      document.removeEventListener('resume', resume)
    }
  }, [pending, busy, network, scope, reconcile, finish])

  const confirm = async (hash: Hash, kind: WalletTransactionKind, expiresAt?: number) => {
    if (!scope) throw new Error('Connect a wallet first.')
    setError(null)
    const transaction: WalletTransaction = { hash, kind, submittedAt: Date.now(), ...(expiresAt ? { expiresAt } : {}) }
    setRecord({ scope, transaction })
    try {
      saveWalletTransaction(scope, transaction)
    } catch {
      setError('Keep this tab open: the pending transaction could not be saved in browser storage.')
    }
    let receipt: TransactionReceipt
    let replaced = false
    try {
      receipt = await publicClient(network).waitForTransactionReceipt({
        hash,
        onReplaced: (replacement) => {
          replaced = replacement.reason !== 'repriced'
          if (!replaced) {
            transaction.hash = replacement.transaction.hash
            if (identity.current === scope) setRecord({ scope, transaction: { ...transaction } })
            try {
              saveWalletTransaction(scope, transaction)
            } catch {
              /* Keep tracking in memory. */
            }
          }
        },
      })
    } catch {
      throw new PendingWalletTransactionError('Transaction confirmation is taking longer than expected.')
    }
    if (replaced) {
      saveWalletTransaction(scope, null)
      setRecord(null)
      throw new Error('Transaction was cancelled or replaced in your wallet. Check its result before trying again.')
    }
    await finish(scope, transaction, receipt.status === 'success')
    if (receipt.status !== 'success') throw new Error('Transaction reverted. You can try the operation again.')
  }

  return {
    pending,
    checking,
    error,
    revision,
    confirm,
    refresh: () => setRecord((current) => (current ? { ...current, transaction: { ...current.transaction } } : null)),
  }
}
