import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address, Hash, TransactionReceipt } from 'viem'
import { type DriveNetwork, publicClient, scopeFor } from '../lib/filecoin-pin/browser-wallet.ts'
import { getTransactionMessageCid, resolveTransactionReceipt } from '../lib/filecoin-pin/transaction-receipt.ts'
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
  const queryClient = useQueryClient()
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
    async (
      targetScope: string,
      transaction: WalletTransaction,
      success: boolean,
      replaced = false,
      trackedHash = transaction.hash
    ) => {
      if (identity.current !== targetScope) return
      if (success && !replaced) await onConfirmed(transaction)
      // Another tab may have submitted a newer operation while this receipt was pending.
      if (readWalletTransaction(targetScope)?.hash === trackedHash) saveWalletTransaction(targetScope, null)
      if (identity.current !== targetScope) return
      setRecord(null)
      setChecking(false)
      setError(
        replaced
          ? 'Transaction was cancelled or replaced in your wallet. Check its result before trying again.'
          : success
            ? null
            : 'Transaction reverted. You can try the operation again.'
      )
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
        let replaced = false
        const client = publicClient(network)
        const transaction: WalletTransaction = { ...pending }
        try {
          const result = await queryClient.fetchQuery({
            queryKey: ['drive-wallet-receipt', scope, pending.hash],
            queryFn: () => resolveTransactionReceipt(client, transaction),
            retry: false,
            staleTime: 0,
          })
          if (result.status !== 'pending') {
            success = result.status === 'success'
            replaced = result.status === 'replaced'
            transaction.hash = result.hash ?? transaction.hash
          }
          transaction.messageCid = result.messageCid ?? transaction.messageCid
        } catch {
          // Not found, connection failures and replaced hashes are not proof of failure.
        }
        if (success === undefined && (await reconcile(transaction))) success = true
        if (!cancelled) {
          if (success !== undefined) await finish(scope, transaction, success, replaced, pending.hash)
          else if (!pending.messageCid && transaction.messageCid) {
            saveWalletTransaction(scope, transaction)
            setRecord({ scope, transaction })
          }
        }
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
  }, [pending, busy, network, scope, reconcile, finish, queryClient])

  const confirm = async (
    hash: Hash,
    kind: WalletTransactionKind,
    expiresAt?: number,
    session?: WalletTransaction['session']
  ) => {
    if (!scope) throw new Error('Connect a wallet first.')
    setError(null)
    const transaction: WalletTransaction = {
      hash,
      kind,
      submittedAt: Date.now(),
      ...(expiresAt ? { expiresAt } : {}),
      ...(session ? { session } : {}),
    }
    setRecord({ scope, transaction })
    try {
      saveWalletTransaction(scope, transaction)
    } catch {
      setError('Keep this tab open: the pending transaction could not be saved in browser storage.')
    }
    // Preserve the original message CID while the node still knows the submitted transaction.
    // Missing RPC data must never prevent tracking the hash itself.
    try {
      transaction.messageCid = await getTransactionMessageCid(publicClient(network), hash)
      if (transaction.messageCid) saveWalletTransaction(scope, transaction)
    } catch {
      /* Receipt tracking and permission reconciliation still work without a message CID. */
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
      await finish(scope, transaction, false, true)
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
