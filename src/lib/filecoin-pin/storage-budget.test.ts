import type { Synapse } from '@filoz/synapse-sdk'
import { expect, it, vi } from 'vitest'
import { quoteStorageBudget } from './storage-budget.ts'
import { storageBudgetBytes, storageBudgetEpochs, storageBudgetInputError } from './storage-budget-input.ts'

const { resolve } = vi.hoisted(() => ({ resolve: vi.fn() }))
vi.mock('./upload-funding.ts', () => ({ resolveUploadContexts: resolve }))
vi.mock('../local-storage/data-set.ts', () => ({ getStoredDataSetIds: () => [12, 13] }))

it('quotes the shared budget once across reused contexts without executing funding', async () => {
  const contexts = [{ dataSetId: 12n }, { dataSetId: 13n }]
  resolve.mockResolvedValue(contexts)
  const execute = vi.fn()
  const costs = { depositNeeded: 100n }
  const account = { availableFunds: 50n, totalLockup: 20n }
  const prepare = vi.fn().mockResolvedValue({ costs, transaction: { execute } })
  const synapse = {
    storage: { prepare },
    payments: { accountSummary: vi.fn().mockResolvedValue(account) },
  } as unknown as Synapse
  expect(await quoteStorageBudget(synapse, '314:owner', 1, 30)).toEqual({ costs, account, copies: 2 })
  expect(resolve).toHaveBeenCalledWith(synapse, { dataSetIds: [12n, 13n] })
  expect(prepare).toHaveBeenCalledWith({ context: contexts, pieceSizes: [1073741824n], extraRunwayEpochs: 86400n })
  expect(execute).not.toHaveBeenCalled()
})

it('allows budgets above the former capacity and duration caps', async () => {
  const prepare = vi.fn().mockResolvedValue({ costs: { depositNeeded: 0n } })
  const synapse = {
    storage: { prepare },
    payments: { accountSummary: vi.fn().mockResolvedValue({}) },
  } as unknown as Synapse
  await quoteStorageBudget(synapse, '314:owner', 2048, 730)
  expect(prepare).toHaveBeenCalledWith({
    context: expect.any(Array),
    pieceSizes: [2199023255552n],
    extraRunwayEpochs: 2102400n,
  })
})

it('validates positive inputs and exact numeric conversion without product caps', () => {
  expect(storageBudgetInputError(2048, 730)).toBeUndefined()
  expect(storageBudgetInputError(0, 30)).toBe('Enter a storage amount greater than 0.')
  expect(storageBudgetInputError(1, 0)).toBe('Enter a whole number of days greater than 0.')
  expect(storageBudgetInputError(1, 1.5)).toBe('Enter a whole number of days greater than 0.')
  expect(storageBudgetInputError(Infinity, 30)).toBeTruthy()
  expect(storageBudgetInputError(Number.MAX_VALUE, 30)).toBeUndefined()
})

it('quotes 10240000 GiB using exact BigInt bytes', async () => {
  const prepare = vi.fn().mockResolvedValue({ costs: { depositNeeded: 0n } })
  const synapse = {
    storage: { prepare },
    payments: { accountSummary: vi.fn().mockResolvedValue({}) },
  } as unknown as Synapse
  await quoteStorageBudget(synapse, '314:owner', '10240000', '30')
  expect(prepare).toHaveBeenCalledWith({
    context: expect.any(Array),
    pieceSizes: [10995116277760000n],
    extraRunwayEpochs: 86400n,
  })
})

it('preserves decimal and large integer precision from input text', () => {
  expect(storageBudgetBytes('9007199254740993')).toBe(9007199254740993n * 1024n ** 3n)
  expect(storageBudgetBytes('0.1')).toBe(107374183n)
  expect(storageBudgetBytes('1.024e7')).toBe(10995116277760000n)
  expect(storageBudgetBytes('1e-100')).toBe(1n)
  expect(storageBudgetEpochs('9007199254740993')).toBe(9007199254740993n * 2880n)
  expect(storageBudgetEpochs('30.0')).toBe(86400n)
  expect(storageBudgetInputError('1', '1.5')).toBe('Enter a whole number of days greater than 0.')
})
