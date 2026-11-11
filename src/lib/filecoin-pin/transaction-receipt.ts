import { CID } from 'multiformats/cid'
import { BaseError, type Hash, type PublicClient, RpcRequestError } from 'viem'
import type { WalletTransaction } from '../local-storage/wallet-transaction.ts'

type ReceiptClient = Pick<PublicClient, 'request' | 'getTransactionReceipt'>
type MessageCid = { '/': string }
type MessageLookup = { Message: MessageCid; Receipt: { ExitCode: number } }
// Recover recent replacements without requiring old account state or an unbounded chain search.
const MESSAGE_LOOKBACK_EPOCHS = 120

export type WalletTransactionResult = {
  status: 'pending' | 'success' | 'reverted' | 'replaced'
  hash?: Hash
  messageCid?: string
}

export async function getTransactionMessageCid(client: ReceiptClient, hash: Hash): Promise<string | undefined> {
  const result = await client.request<{ Parameters: [Hash]; ReturnType: MessageCid | null }>(
    { method: 'Filecoin.EthGetMessageCidByTransactionHash', params: [hash] },
    { retryCount: 0 }
  )
  return result ? CID.parse(result['/']).toString() : undefined
}

/** The regular receipt remains authoritative; Lotus additionally accepts gas-repriced messages. */
export async function resolveTransactionReceipt(
  client: ReceiptClient,
  transaction: Pick<WalletTransaction, 'hash' | 'messageCid'>
): Promise<WalletTransactionResult> {
  const receipt = await client.getTransactionReceipt({ hash: transaction.hash }).catch(() => null)
  if (receipt) return { status: receipt.status, hash: receipt.transactionHash ?? transaction.hash }
  const messageCid =
    transaction.messageCid ?? (await getTransactionMessageCid(client, transaction.hash).catch(() => undefined))
  const pending = { status: 'pending' as const, messageCid }
  if (!messageCid) return pending

  let lookup: MessageLookup | null
  try {
    lookup = await client.request<{
      Parameters: [[], MessageCid, number, boolean]
      ReturnType: MessageLookup | null
    }>(
      { method: 'Filecoin.StateSearchMsg', params: [[], { '/': messageCid }, MESSAGE_LOOKBACK_EPOCHS, true] },
      { retryCount: 0 }
    )
  } catch (cause) {
    // Lotus exposes call-changing replacements as an untyped RPC error. Other failures remain unknown.
    const rpcError = cause instanceof BaseError ? cause.walk((error) => error instanceof RpcRequestError) : cause
    if (
      rpcError instanceof RpcRequestError &&
      rpcError.details?.includes('message was replaced:') &&
      rpcError.details.includes('NOT a valid replacement message')
    )
      return { status: 'replaced', messageCid }
    return pending
  }
  if (!lookup || !Number.isSafeInteger(lookup.Receipt?.ExitCode) || lookup.Receipt.ExitCode < 0) return pending
  let executedCid: string
  try {
    executedCid = CID.parse(lookup.Message['/']).toString()
  } catch {
    return pending
  }
  // The native receipt already proves execution. A missing hash mapping must not block recovery.
  const hash =
    executedCid === messageCid
      ? transaction.hash
      : await client
          .request<{ Parameters: [MessageCid]; ReturnType: Hash | null }>(
            { method: 'Filecoin.EthGetTransactionHashByCid', params: [{ '/': executedCid }] },
            { retryCount: 0 }
          )
          .catch(() => undefined)
  return { status: lookup.Receipt.ExitCode === 0 ? 'success' : 'reverted', hash: hash ?? undefined, messageCid }
}
