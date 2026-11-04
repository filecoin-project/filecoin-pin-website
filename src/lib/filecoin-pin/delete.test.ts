import type { Synapse } from '@filoz/synapse-sdk'
import { WaitForTransactionReceiptTimeoutError } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

const { receipt, matches, getReceipt, rpc } = vi.hoisted(() => ({
  receipt: vi.fn(),
  matches: vi.fn(),
  getReceipt: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('@filoz/synapse-core/pdp-verifier', () => ({ findPieceIdsByCid: matches }))
vi.mock('./browser-wallet.ts', () => ({
  publicClient: () => ({ waitForTransactionReceipt: receipt, getTransactionReceipt: getReceipt, request: rpc }),
}))

import { applyDeletionUpdate } from '../../utils/file-deletion.ts'
import { getCachedPieces, mutateCachedPieces, setCachedPieces } from '../local-storage/piece-cache.ts'
import { DeletionConfirmationPendingError, scheduleFileDeletion } from './delete.ts'

const file = {
  network: 'mainnet',
  pieceCid: 'bafkzcibcd4bdomn3tgwgrh3g532zopskstnbrd2n3sxfqbze7rxt7vqn7veigmy',
  datasetIds: ['1', '2'],
} as DatasetPiece
const hash = `0x${'a'.repeat(64)}`
beforeEach(() => {
  vi.resetAllMocks()
  getReceipt.mockResolvedValue(null)
  rpc.mockResolvedValue(null)
  matches.mockResolvedValue({ items: [1n, 2n] })
})
describe('deletion across storage copies', () => {
  it('replays a failed receipt save without replacing newer transactions or other datasets', async () => {
    const scope = 'deletion-recovery'
    const pending = { transactionHash: hash, confirmed: false }
    const other = { transactionHash: `0x${'b'.repeat(64)}`, confirmed: false }
    const newer = { transactionHash: `0x${'c'.repeat(64)}`, confirmed: false }
    const record = { ...file, id: 'file', deletion: { '1': pending, '2': other } }
    const change = { datasetId: '1', previous: pending, next: { ...pending, confirmed: true } }
    expect(applyDeletionUpdate(record, change).deletion?.['2']).toEqual(other)
    setCachedPieces(scope, [record])
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    try {
      await expect(
        mutateCachedPieces(scope, (files) => files.map((file) => applyDeletionUpdate(file, change)))
      ).rejects.toThrow('free browser storage')
    } finally {
      write.mockRestore()
    }
    // A different page has advanced while this page retained its failed save.
    localStorage.setItem(
      `filecoin-pin-piece-cache-v1-${scope}`,
      JSON.stringify([{ ...record, deletion: { '1': newer, '2': other } }])
    )
    await mutateCachedPieces(scope, (files) => files)
    const saved = getCachedPieces(scope)?.[0]
    if (!saved) throw new Error('Missing deletion checkpoint')
    expect(saved.deletion).toEqual({ '1': newer, '2': other })
    expect(applyDeletionUpdate(saved, { datasetId: '1', previous: pending }).deletion).toEqual(saved.deletion)
  })

  it('waits for a durable pending hash before querying its receipt', async () => {
    const submit = vi.fn().mockResolvedValue(hash)
    const context = { deletePieces: submit, getScheduledRemovals: async () => [] }
    const synapse = { storage: { createContext: async () => context } } as unknown as Synapse
    let saved!: () => void
    const persist = vi.fn().mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          saved = resolve
        })
    )
    receipt.mockResolvedValue({ status: 'success' })
    const deletion = scheduleFileDeletion(synapse, { ...file, datasetIds: ['1'] }, persist)
    await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce())
    expect(receipt).not.toHaveBeenCalled()
    saved()
    await deletion
    expect(receipt).toHaveBeenCalledWith({ hash, checkReplacement: false })
  })

  it('persists submitted hashes and resumes a partial deletion without resubmitting confirmed copies', async () => {
    const submit = vi.fn().mockResolvedValue(hash)
    const context = vi.fn().mockImplementation(async ({ dataSetId }) => {
      if (dataSetId === 2n) throw new Error('provider unavailable')
      return { deletePieces: submit, getScheduledRemovals: async () => [] }
    })
    const synapse = { storage: { createContext: context } } as unknown as Synapse
    receipt.mockResolvedValue({ status: 'success' })
    let checkpoint = file
    await expect(
      scheduleFileDeletion(synapse, file, (value) => {
        checkpoint = value
      })
    ).rejects.toThrow('provider unavailable')
    expect(checkpoint.deletion?.['1']).toEqual({ transactionHash: hash, confirmed: true })
    context.mockResolvedValue({ deletePieces: submit, getScheduledRemovals: async () => [] })
    await scheduleFileDeletion(synapse, checkpoint, (value) => {
      checkpoint = value
    })
    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit).toHaveBeenCalledWith({ pieces: [1n, 2n] })
    expect(checkpoint.deletion?.['2']?.confirmed).toBe(true)
  })

  it('checks a persisted pending hash instead of submitting another deletion', async () => {
    const context = vi.fn()
    const synapse = { storage: { createContext: context } } as unknown as Synapse
    receipt.mockResolvedValue({ status: 'success' })
    await scheduleFileDeletion(
      synapse,
      { ...file, datasetIds: ['1'], deletion: { '1': { transactionHash: hash, confirmed: false } } },
      vi.fn()
    )
    expect(context).not.toHaveBeenCalled()
    expect(receipt).toHaveBeenCalledWith({ hash, checkReplacement: false })
  })

  it('keeps a timed-out hash and checks it on continuation without submitting again', async () => {
    const submit = vi.fn().mockResolvedValue(hash)
    const context = vi.fn().mockResolvedValue({ deletePieces: submit, getScheduledRemovals: async () => [] })
    const synapse = { storage: { createContext: context } } as unknown as Synapse
    receipt.mockRejectedValueOnce(new WaitForTransactionReceiptTimeoutError({ hash: hash as `0x${string}` }))
    let checkpoint: DatasetPiece = { ...file, datasetIds: ['1'] }
    const persist = (next: DatasetPiece) => {
      checkpoint = next
    }
    await expect(scheduleFileDeletion(synapse, checkpoint, persist)).rejects.toThrow(DeletionConfirmationPendingError)
    expect(checkpoint.deletion?.['1']).toEqual({ transactionHash: hash, confirmed: false })
    receipt.mockResolvedValueOnce({ status: 'success' })
    await scheduleFileDeletion(synapse, checkpoint, persist)
    expect(submit).toHaveBeenCalledOnce()
    expect(context).toHaveBeenCalledOnce()
    expect(checkpoint.deletion?.['1']?.confirmed).toBe(true)
    expect(receipt).toHaveBeenLastCalledWith({ hash, checkReplacement: false })
  })

  it('persists partial batches and resumes after the removal queue drains', async () => {
    const ids = Array.from({ length: 40 }, (_, index) => BigInt(index + 1))
    matches
      .mockResolvedValueOnce({ items: ids.slice(0, 30), nextCursor: 31n })
      .mockResolvedValueOnce({ items: ids.slice(30) })
    const submit = vi.fn().mockResolvedValue(hash)
    const queued = vi.fn().mockResolvedValue([])
    const synapse = {
      storage: { createContext: vi.fn().mockResolvedValue({ deletePieces: submit, getScheduledRemovals: queued }) },
    } as unknown as Synapse
    receipt.mockResolvedValue({ status: 'success' })
    let checkpoint: DatasetPiece = { ...file, datasetIds: ['1'] }
    const persist = (value: DatasetPiece) => {
      checkpoint = value
    }
    await expect(scheduleFileDeletion(synapse, checkpoint, persist)).rejects.toThrow('progress saved')
    expect(submit).toHaveBeenCalledWith({ pieces: ids.slice(0, 35) })
    expect(checkpoint.deletion?.['1']).toEqual({ transactionHash: hash, confirmed: true, remaining: true })
    matches.mockResolvedValue({ items: ids })
    queued.mockResolvedValue(ids.slice(0, 35))
    await expect(scheduleFileDeletion(synapse, checkpoint, persist)).rejects.toThrow('next proving period')
    expect(submit).toHaveBeenCalledTimes(1)
    queued.mockResolvedValue([])
    matches.mockResolvedValue({ items: ids.slice(35) })
    await scheduleFileDeletion(synapse, checkpoint, persist)
    expect(submit).toHaveBeenLastCalledWith({ pieces: ids.slice(35) })
    expect(checkpoint.deletion?.['1'].remaining).not.toBe(true)
  })

  it('clears a reverted checkpoint so a retry can submit again', async () => {
    const synapse = { storage: { createContext: vi.fn() } } as unknown as Synapse
    receipt.mockResolvedValue({ status: 'reverted' })
    let checkpoint = file
    await expect(
      scheduleFileDeletion(
        synapse,
        { ...file, datasetIds: ['1'], deletion: { '1': { transactionHash: hash, confirmed: false } } },
        (value) => {
          checkpoint = value
        }
      )
    ).rejects.toThrow('reverted')
    expect(checkpoint.deletion?.['1']).toBeUndefined()
  })

  it('uses only available queue capacity and excludes already scheduled pieces', async () => {
    const submit = vi.fn().mockResolvedValue(hash)
    const queued = Array.from({ length: 34 }, (_, index) => BigInt(index + 1))
    const synapse = {
      storage: {
        createContext: vi.fn().mockResolvedValue({
          deletePieces: submit,
          getScheduledRemovals: async () => queued,
        }),
      },
    } as unknown as Synapse
    matches.mockResolvedValue({ items: [1n, 40n, 41n] })
    receipt.mockResolvedValue({ status: 'success' })
    await expect(scheduleFileDeletion(synapse, { ...file, datasetIds: ['1'] }, vi.fn())).rejects.toThrow(
      'another batch'
    )
    expect(submit).toHaveBeenCalledWith({ pieces: [40n] })
  })

  it('continues other datasets while one queue is full', async () => {
    const submit = vi.fn().mockResolvedValue(hash)
    const synapse = {
      storage: {
        createContext: vi.fn().mockImplementation(async ({ dataSetId }) => ({
          deletePieces: submit,
          getScheduledRemovals: async () =>
            dataSetId === 1n ? Array.from({ length: 35 }, (_, i) => BigInt(i + 100)) : [],
        })),
      },
    } as unknown as Synapse
    receipt.mockResolvedValue({ status: 'success' })
    let checkpoint = file
    await expect(
      scheduleFileDeletion(synapse, file, (value) => {
        checkpoint = value
      })
    ).rejects.toThrow('Dataset(s) 1')
    expect(submit).toHaveBeenCalledTimes(1)
    expect(checkpoint.deletion?.['2']?.confirmed).toBe(true)
  })
})

it('plans active aliases without borrowing archived receipts or mutating the directory', async () => {
  const { planDeletion } = await import('./delete.ts')
  const archivedHash = `0x${'d'.repeat(64)}`
  const selected = { ...file, id: 'new', datasetIds: ['1', '2'] }
  const archived = {
    ...file,
    id: 'old',
    deletion: {
      '1': { transactionHash: archivedHash, confirmed: true },
      '2': { transactionHash: archivedHash, confirmed: true },
    },
  }
  const pending = { ...file, id: 'pending', deletion: { '1': { transactionHash: hash, confirmed: false } } }
  const history = [selected, archived, pending, { ...file, id: 'other', pieceCid: 'different' }]
  const before = structuredClone(history)
  const plan = planDeletion(history, selected)
  expect([...plan.aliasIds]).toEqual(['new', 'pending'])
  expect(plan.file.datasetIds).toEqual(['1', '2'])
  expect(plan.file.deletion).toEqual({ '1': { transactionHash: hash, confirmed: false, remaining: true } })
  expect(history).toEqual(before)
})

it('plans outstanding batches ahead of an alias with a completed receipt', async () => {
  const { planDeletion } = await import('./delete.ts')
  const finished = {
    ...file,
    id: 'finished',
    datasetIds: ['1', '2'],
    deletion: {
      '1': { transactionHash: hash, confirmed: true },
    },
  }
  const ongoing = {
    ...file,
    id: 'ongoing',
    datasetIds: ['1', '2'],
    deletion: {
      '1': { transactionHash: hash, confirmed: true, remaining: true },
    },
  }
  expect(planDeletion([finished, ongoing], ongoing).file.deletion?.['1'].remaining).toBe(true)
})

it('skips indexed removals while continuing deletion of the remaining copy', async () => {
  const { planDeletion } = await import('./delete.ts')
  const selected = { ...file, id: 'recovered', removedCopies: ['1'] }
  const plan = planDeletion([selected], selected)
  const submit = vi.fn().mockResolvedValue(hash)
  const createContext = vi.fn().mockResolvedValue({ deletePieces: submit, getScheduledRemovals: async () => [] })
  receipt.mockResolvedValue({ status: 'success' })
  await scheduleFileDeletion({ storage: { createContext } } as unknown as Synapse, plan.file, vi.fn())
  expect(createContext).toHaveBeenCalledOnce()
  expect(createContext).toHaveBeenCalledWith({ dataSetId: 2n })
  const newer = { ...file, id: 'newer' }
  expect(planDeletion([selected, newer], selected).file.removedCopies).toEqual([])
})

it('submits independent files sharing a dataset without waiting for earlier confirmations', async () => {
  const submit = vi.fn().mockResolvedValue(hash)
  const context = vi.fn().mockResolvedValue({ deletePieces: submit, getScheduledRemovals: async () => [] })
  const synapse = { storage: { createContext: context } } as unknown as Synapse
  const confirms: Array<(value: { status: string }) => void> = []
  receipt.mockImplementation(
    () =>
      new Promise((resolve) => {
        confirms.push(resolve)
      })
  )
  const first = scheduleFileDeletion(synapse, { ...file, datasetIds: ['1'] }, vi.fn())
  await vi.waitFor(() => expect(receipt).toHaveBeenCalledOnce())
  const second = scheduleFileDeletion(synapse, { ...file, datasetIds: ['1'] }, vi.fn())
  await vi.waitFor(() => expect(receipt).toHaveBeenCalledTimes(2))
  expect(submit).toHaveBeenCalledTimes(2)
  for (const confirm of confirms) confirm({ status: 'success' })
  await Promise.all([first, second])
})

it('submits all copies before confirmation and waits for every copy after a failure', async () => {
  const submit = vi.fn().mockResolvedValue(hash)
  const synapse = {
    storage: {
      createContext: vi.fn().mockResolvedValue({ deletePieces: submit, getScheduledRemovals: async () => [] }),
    },
  } as unknown as Synapse
  const confirms: Array<(value: { status: string }) => void> = []
  receipt.mockImplementation(
    () =>
      new Promise((resolve) => {
        confirms.push(resolve)
      })
  )
  let checkpoint: DatasetPiece = { ...file }
  const save = (next: DatasetPiece) => {
    checkpoint = next
  }
  let settled = false
  const deletion = scheduleFileDeletion(synapse, file, save).finally(() => {
    settled = true
  })
  const result = expect(deletion).rejects.toThrow('Deletion transaction reverted for dataset 1')
  await vi.waitFor(() => expect(receipt).toHaveBeenCalledTimes(2))
  expect(checkpoint.deletion?.['1']?.confirmed).toBe(false)
  expect(checkpoint.deletion?.['2']?.confirmed).toBe(false)
  confirms[0]({ status: 'reverted' })
  await vi.waitFor(() => expect(checkpoint.deletion?.['1']).toBeUndefined())
  expect(settled).toBe(false)
  confirms[1]({ status: 'success' })
  await result
  expect(checkpoint.deletion?.['2']?.confirmed).toBe(true)
})

const originalMessageCid = 'bafy2bzacebhdmbh4f7uviyalf3dsrwwonqaqwnomzkdxxtsik74ukjgtenjco'
const replacementMessageCid = 'bafy2bzacea7xazu4w457k2r2imovbsjugluetppmswqfod6hh5w3gshfgv2nw'
const replacementHash = '0x52246f79586301242fdda27635e2fe2bb4874c19def11899fc246e2754e2ad28'

it.each([false, true])(
  'confirms a repriced deletion and saves the executed hash (after timeout: %s)',
  async (afterTimeout) => {
    const createContext = vi.fn()
    const synapse = { storage: { createContext } } as unknown as Synapse
    let searches = 0
    rpc.mockImplementation(async ({ method }) => {
      if (method === 'Filecoin.EthGetMessageCidByTransactionHash') return { '/': originalMessageCid }
      if (method === 'Filecoin.StateSearchMsg') {
        if (afterTimeout && searches++ === 0) return null
        return { Message: { '/': replacementMessageCid }, Receipt: { ExitCode: 0 } }
      }
      if (method === 'Filecoin.EthGetTransactionHashByCid') return replacementHash
      throw new Error(`Unexpected RPC method ${method}`)
    })
    let checkpoint: DatasetPiece = {
      ...file,
      datasetIds: ['1'],
      deletion: { '1': { transactionHash: hash, confirmed: false } },
    }
    receipt.mockImplementation(async () => {
      expect(checkpoint.deletion?.['1']?.messageCid).toBe(originalMessageCid)
      throw new WaitForTransactionReceiptTimeoutError({ hash: hash as `0x${string}` })
    })
    await scheduleFileDeletion(synapse, checkpoint, (_file, change) => {
      checkpoint = applyDeletionUpdate(checkpoint, change)
    })
    expect(createContext).not.toHaveBeenCalled()
    expect(receipt).toHaveBeenCalledTimes(afterTimeout ? 1 : 0)
    expect(checkpoint.deletion?.['1']).toEqual({
      transactionHash: replacementHash,
      confirmed: true,
      messageCid: originalMessageCid,
    })
    expect(rpc).toHaveBeenCalledWith(
      { method: 'Filecoin.StateSearchMsg', params: [[], { '/': originalMessageCid }, 120, true] },
      { retryCount: 0 }
    )
  }
)

it('retains an unresolved deletion CID across retries without resubmitting', async () => {
  const createContext = vi.fn()
  const synapse = { storage: { createContext } } as unknown as Synapse
  rpc.mockImplementation(async ({ method }) =>
    method === 'Filecoin.EthGetMessageCidByTransactionHash' ? { '/': originalMessageCid } : null
  )
  receipt.mockRejectedValue(new WaitForTransactionReceiptTimeoutError({ hash: hash as `0x${string}` }))
  let checkpoint: DatasetPiece = {
    ...file,
    datasetIds: ['1'],
    deletion: { '1': { transactionHash: hash, confirmed: false } },
  }
  const persist = (_file: DatasetPiece, change: Parameters<typeof applyDeletionUpdate>[1]) => {
    checkpoint = applyDeletionUpdate(checkpoint, change)
  }
  await expect(scheduleFileDeletion(synapse, checkpoint, persist)).rejects.toBeInstanceOf(
    DeletionConfirmationPendingError
  )
  expect(checkpoint.deletion?.['1']).toEqual({
    transactionHash: hash,
    confirmed: false,
    messageCid: originalMessageCid,
  })
  rpc.mockClear()
  rpc.mockImplementation(async ({ method }) => {
    if (method === 'Filecoin.StateSearchMsg')
      return { Message: { '/': replacementMessageCid }, Receipt: { ExitCode: 0 } }
    if (method === 'Filecoin.EthGetTransactionHashByCid') return replacementHash
    throw new Error('A saved message CID must not need another original-hash mapping')
  })
  await scheduleFileDeletion(synapse, checkpoint, persist)
  expect(rpc).toHaveBeenCalledTimes(2)
  expect(createContext).not.toHaveBeenCalled()
  expect(receipt).toHaveBeenCalledOnce()
  expect(checkpoint.deletion?.['1']?.confirmed).toBe(true)
})
