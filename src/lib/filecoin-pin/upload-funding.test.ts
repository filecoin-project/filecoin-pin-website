import type { Synapse } from '@filoz/synapse-sdk'
import type { StorageContext } from '@filoz/synapse-sdk/storage'
import { expect, it, vi } from 'vitest'
import { prepareUploadContexts } from './upload-funding.ts'

vi.mock('./storage-chain.ts', () => ({ assertCurrentStorageChain: vi.fn() }))
const { freshContexts } = vi.hoisted(() => ({ freshContexts: vi.fn() }))
vi.mock('./fresh-contexts.ts', () => ({ createFreshUploadContexts: freshContexts }))

it('quotes all selected contexts without executing an offered deposit or approval', async () => {
  const contexts = [{}, {}] as StorageContext[]
  const execute = vi.fn()
  const prepare = vi.fn().mockResolvedValue({
    costs: { ready: false, depositNeeded: 5n * 10n ** 16n, needsFwssMaxApproval: true },
    transaction: { execute },
  })
  const synapse = { storage: { prepare } } as unknown as Synapse
  await expect(prepareUploadContexts(synapse, 1000n, { contexts })).rejects.toThrow(
    '0.05 more USDFC for these 2 storage copies'
  )
  expect(prepare).toHaveBeenCalledWith({ context: contexts, pieceSizes: [1000n] })
  expect(execute).not.toHaveBeenCalled()
})

it('keeps the existing dataset and quotes its missing copy before returning upload contexts', async () => {
  const contexts = [{ provider: { id: 4n } }] as StorageContext[]
  const additional = { provider: { id: 2n } } as StorageContext
  freshContexts.mockResolvedValueOnce([additional])
  const createContexts = vi.fn().mockResolvedValue(contexts)
  const prepare = vi.fn().mockResolvedValue({ costs: { ready: true }, transaction: null })
  const synapse = { storage: { prepare, createContexts } } as unknown as Synapse
  expect(await prepareUploadContexts(synapse, 10n, { dataSetIds: [123n] })).toEqual([...contexts, additional])
  expect(createContexts).toHaveBeenCalledWith({ withCDN: false, dataSetIds: [123n] })
  expect(freshContexts).toHaveBeenCalledWith(synapse, expect.any(String), 1, [4n])
  expect(prepare).toHaveBeenCalledWith({ context: [...contexts, additional], pieceSizes: [10n] })
})

it('checks funding for both the reused and new copies before sending any data', async () => {
  const contexts = [{ provider: { id: 4n } }] as StorageContext[]
  const additional = { provider: { id: 2n } } as StorageContext
  freshContexts.mockResolvedValueOnce([additional])
  const prepare = vi.fn().mockResolvedValue({
    costs: { ready: false, depositNeeded: 10n ** 18n, needsFwssMaxApproval: false },
  })
  const synapse = {
    storage: { createContexts: vi.fn().mockResolvedValue(contexts), prepare },
  } as unknown as Synapse
  await expect(prepareUploadContexts(synapse, 10n, { dataSetIds: [123n] })).rejects.toThrow(
    '1 more USDFC for these 2 storage copies'
  )
  expect(prepare).toHaveBeenCalledWith({ context: [...contexts, additional], pieceSizes: [10n] })
})

it('preserves IPFS indexing and browser metadata for smart-selected providers', async () => {
  const createContexts = vi.fn().mockResolvedValue([{}])
  const prepare = vi.fn().mockResolvedValue({ costs: { ready: true } })
  const synapse = { storage: { prepare, createContexts } } as unknown as Synapse
  await prepareUploadContexts(synapse, 10n, { metadata: { clientId: 'browser' }, providerIds: [4n] })
  expect(createContexts).toHaveBeenCalledWith({
    withCDN: false,
    providerIds: [4n],
    metadata: {
      withIPFSIndexing: '',
      source: 'filecoin-pin',
      clientId: 'browser',
    },
  })
})
