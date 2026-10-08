import type { Synapse } from '@filoz/synapse-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

const { receipt, matches } = vi.hoisted(() => ({ receipt: vi.fn(), matches: vi.fn() }))
vi.mock('@filoz/synapse-core/pdp-verifier', () => ({ findPieceIdsByCid: matches }))
vi.mock('./browser-wallet.ts', () => ({ publicClient: () => ({ waitForTransactionReceipt: receipt }) }))

import { scheduleFileDeletion } from './delete.ts'

const file = {
  network: 'mainnet',
  pieceCid: 'bafkzcibcd4bdomn3tgwgrh3g532zopskstnbrd2n3sxfqbze7rxt7vqn7veigmy',
  datasetIds: ['1', '2'],
} as DatasetPiece
const hash = `0x${'a'.repeat(64)}`
beforeEach(() => {
  vi.resetAllMocks()
  matches.mockResolvedValue({ items: [1n, 2n] })
})
describe('deletion across storage copies', () => {
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
    expect(receipt).toHaveBeenCalledWith({ hash })
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
