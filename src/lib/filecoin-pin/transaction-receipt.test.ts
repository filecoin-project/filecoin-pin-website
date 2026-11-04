import { createPublicClient, http } from 'viem'
import { beforeEach, expect, it, vi } from 'vitest'
import type { WalletTransaction } from '../local-storage/wallet-transaction.ts'
import { getTransactionMessageCid, resolveTransactionReceipt } from './transaction-receipt.ts'

const hash = `0x${'a'.repeat(64)}` as const
const replacementHash = `0x${'b'.repeat(64)}` as const
const messageCid = 'bafy2bzacea3wsdh6y3a36tb3skempjoxqpuyompjbmfeyf34fi3uy6uue42v4'
const executedCid = 'bafy2bzacebp3shtrn43k7g3unredz7fxn4gj533d3o43tqn2p2ipxxhrvchve'
const replies = new Map<string, { result?: unknown; error?: { code: number; message: string } }>()
const rpc = vi.fn((request: { method: string; params: unknown[] }) => replies.get(request.method))
const client = createPublicClient({
  transport: http('https://rpc.test', {
    retryCount: 0,
    fetchFn: async (_url, init) => {
      const request = JSON.parse(init?.body as string)
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...rpc(request) }), {
        headers: { 'Content-Type': 'application/json' },
      })
    },
  }),
})
const pending: WalletTransaction = { hash, kind: 'deposit', submittedAt: 1, messageCid }
const lookup = (ExitCode = 0, cid = executedCid) => ({ Message: { '/': cid }, Receipt: { ExitCode } })

beforeEach(() => {
  vi.clearAllMocks()
  replies.clear()
  replies.set('eth_getTransactionReceipt', { result: null })
  replies.set('Filecoin.EthGetMessageCidByTransactionHash', { result: { '/': messageCid } })
  replies.set('Filecoin.StateSearchMsg', { result: null })
  replies.set('Filecoin.EthGetTransactionHashByCid', { result: replacementHash })
})

it('captures a message CID through the existing viem transport', async () => {
  expect(await getTransactionMessageCid(client, hash)).toBe(messageCid)
  expect(rpc).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'Filecoin.EthGetMessageCidByTransactionHash',
      params: [hash],
    })
  )
})

it('uses the original receipt without any Lotus lookup', async () => {
  replies.set('eth_getTransactionReceipt', { result: { transactionHash: hash, status: '0x1' } })
  expect(await resolveTransactionReceipt(client, pending)).toEqual({ status: 'success', hash })
  expect(rpc).toHaveBeenCalledOnce()
})

it('retains a late CID mapping for pending work and limits the server search to 120 epochs', async () => {
  expect(await resolveTransactionReceipt(client, { ...pending, messageCid: undefined })).toEqual({
    status: 'pending',
    messageCid,
  })
  expect(rpc).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'Filecoin.StateSearchMsg',
      params: [[], { '/': messageCid }, 120, true],
    })
  )
  expect(rpc).toHaveBeenCalledTimes(3)
})

it('leaves the transaction pending when the original message mapping is unavailable', async () => {
  replies.set('Filecoin.EthGetMessageCidByTransactionHash', { result: null })
  expect(await resolveTransactionReceipt(client, { ...pending, messageCid: undefined })).toMatchObject({
    status: 'pending',
  })
  expect(rpc).toHaveBeenCalledTimes(2)
})

it('accepts a gas-repriced message receipt and resolves its actual Ethereum hash', async () => {
  replies.set('Filecoin.StateSearchMsg', { result: lookup() })
  expect(await resolveTransactionReceipt(client, pending)).toEqual({
    status: 'success',
    hash: replacementHash,
    messageCid,
  })
  expect(rpc.mock.calls.map(([request]) => request.method)).toEqual([
    'eth_getTransactionReceipt',
    'Filecoin.StateSearchMsg',
    'Filecoin.EthGetTransactionHashByCid',
  ])
})

it('does not require hash conversion when Lotus finds the original message', async () => {
  replies.set('Filecoin.StateSearchMsg', { result: lookup(0, messageCid) })
  expect(await resolveTransactionReceipt(client, pending)).toEqual({ status: 'success', hash, messageCid })
  expect(rpc).toHaveBeenCalledTimes(2)
})

it('preserves a nonzero native exit code as a failed operation', async () => {
  replies.set('Filecoin.StateSearchMsg', { result: lookup(16) })
  expect(await resolveTransactionReceipt(client, pending)).toMatchObject({ status: 'reverted', hash: replacementHash })
})

it('recognizes only Lotus’s explicit call-changing replacement error', async () => {
  replies.set('Filecoin.StateSearchMsg', {
    error: {
      code: 1,
      message:
        'checking for message execution during lookback: message was replaced: found message with equal nonce as the one we are looking for that is NOT a valid replacement message (F:old n 7, TS:new n7)',
    },
  })
  expect(await resolveTransactionReceipt(client, pending)).toEqual({ status: 'replaced', messageCid })
  expect(rpc).toHaveBeenCalledTimes(2)
})

it.each([
  { code: -32601, message: 'Method not found' },
  { code: -32005, message: 'Rate limit exceeded' },
  { code: 1, message: 'failed to load message' },
  { code: 1, message: 'message was replaced: unknown failure' },
])('keeps the outcome unknown for RPC error $message', async (error) => {
  replies.set('Filecoin.StateSearchMsg', { error })
  expect(await resolveTransactionReceipt(client, pending)).toEqual({ status: 'pending', messageCid })
})

it.each([{ result: null }, { error: { code: -32601, message: 'Method not found' } }])(
  'uses the execution receipt even when hash conversion is unavailable (%j)',
  async (reply) => {
    replies.set('Filecoin.StateSearchMsg', { result: lookup() })
    replies.set('Filecoin.EthGetTransactionHashByCid', reply)
    expect(await resolveTransactionReceipt(client, pending)).toEqual({ status: 'success', hash: undefined, messageCid })
  }
)

it.each([
  { Message: { '/': executedCid }, Receipt: {} },
  { Message: { '/': executedCid }, Receipt: { ExitCode: '0' } },
  { Message: { '/': 'not-a-cid' }, Receipt: { ExitCode: 0 } },
])('keeps malformed lookup results unresolved (%j)', async (result) => {
  replies.set('Filecoin.StateSearchMsg', { result })
  expect(await resolveTransactionReceipt(client, pending)).toEqual({ status: 'pending', messageCid })
})
