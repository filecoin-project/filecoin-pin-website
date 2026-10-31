import type { Synapse } from '@filoz/synapse-sdk'
import type { StorageContext } from '@filoz/synapse-sdk/storage'
import { beforeEach, expect, it, vi } from 'vitest'
import { prepareUploadContexts } from './upload-funding.ts'

vi.mock('./storage-chain.ts', () => ({ assertCurrentStorageChain: vi.fn() }))
const { freshContexts, live } = vi.hoisted(() => ({ freshContexts: vi.fn(), live: vi.fn() }))
vi.mock('@filoz/synapse-core/pdp-verifier', () => ({ dataSetLive: live }))
vi.mock('./fresh-contexts.ts', () => ({ createFreshUploadContexts: freshContexts }))

beforeEach(() => {
  vi.resetAllMocks()
  live.mockResolvedValue(true)
})

it('quotes all selected contexts without executing an offered deposit or approval', async () => {
  const contexts = [{}, {}] as unknown as StorageContext[]
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
  const contexts = [
    { provider: { id: 4n }, dataSetMetadata: { source: 'filecoin-drive' } },
  ] as unknown as StorageContext[]
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
  const contexts = [
    { provider: { id: 4n }, dataSetMetadata: { source: 'filecoin-drive' } },
  ] as unknown as StorageContext[]
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
      source: 'filecoin-drive',
      clientId: 'browser',
    },
  })
})

it('skips non-Drive datasets and fills the missing copy on a different provider', async () => {
  const drive = { provider: { id: 4n }, dataSetMetadata: { source: 'filecoin-drive' } }
  const other = { provider: { id: 4n }, dataSetMetadata: { source: 'filecoin-pin' } }
  const fresh = { provider: { id: 3n } }
  freshContexts.mockResolvedValueOnce([fresh])
  const createContexts = vi.fn().mockResolvedValueOnce([other]).mockResolvedValueOnce([drive])
  const prepare = vi.fn().mockResolvedValue({ costs: { ready: true } })
  const synapse = { storage: { createContexts, prepare } } as unknown as Synapse
  expect(await prepareUploadContexts(synapse, 10n, { dataSetIds: [1n, 2n] })).toEqual([drive, fresh])
  expect(freshContexts).toHaveBeenLastCalledWith(synapse, expect.any(String), 1, [4n])
  expect(prepare).toHaveBeenCalledWith({ context: [drive, fresh], pieceSizes: [10n] })
})

it('creates two fresh copies when none of the known datasets has the Drive marker', async () => {
  const createContexts = vi
    .fn()
    .mockResolvedValueOnce([{ dataSetMetadata: {} }])
    .mockResolvedValueOnce([{ dataSetMetadata: { source: 'filecoin-pin' } }])
  const fresh = [{ provider: { id: 2n } }, { provider: { id: 4n } }]
  freshContexts.mockResolvedValueOnce(fresh)
  const prepare = vi.fn().mockResolvedValue({ costs: { ready: true } })
  const synapse = { storage: { createContexts, prepare } } as unknown as Synapse
  expect(await prepareUploadContexts(synapse, 10n, { dataSetIds: [1n, 2n] })).toEqual(fresh)
  expect(freshContexts).toHaveBeenLastCalledWith(synapse, expect.any(String), 2, [])
})

it('keeps the two-copy target when discovery finds datasets on more providers', async () => {
  const contexts = [1n, 2n, 3n].map((id) => ({ provider: { id }, dataSetMetadata: { source: 'filecoin-drive' } }))
  const createContexts = vi.fn(async ({ dataSetIds }: { dataSetIds: bigint[] }) => [
    contexts[Number(dataSetIds[0]) - 1],
  ])
  const prepare = vi.fn().mockResolvedValue({ costs: { ready: true } })
  const synapse = { storage: { createContexts, prepare } } as unknown as Synapse
  expect(await prepareUploadContexts(synapse, 10n, { dataSetIds: [1n, 2n, 3n] })).toEqual(contexts.slice(0, 2))
  expect(prepare).toHaveBeenCalledWith({ context: contexts.slice(0, 2), pieceSizes: [10n] })
  expect(createContexts).toHaveBeenCalledTimes(2)
  expect(live).not.toHaveBeenCalled()
})

it('skips a chain-confirmed dead dataset and keeps the healthy candidates', async () => {
  const healthy = [4n, 2n].map((id) => ({ provider: { id }, dataSetMetadata: { source: 'filecoin-drive' } }))
  const createContexts = vi
    .fn()
    .mockRejectedValueOnce(new Error('Data set 1 does not exist or is not live'))
    .mockResolvedValueOnce([healthy[0]])
    .mockResolvedValueOnce([healthy[1]])
  const prepare = vi.fn().mockResolvedValue({ costs: { ready: true } })
  const readClient = {}
  const synapse = { readClient, storage: { createContexts, prepare } } as unknown as Synapse
  live.mockResolvedValueOnce(false)
  expect(await prepareUploadContexts(synapse, 10n, { dataSetIds: [1n, 2n, 3n] })).toEqual(healthy)
  expect(live).toHaveBeenCalledExactlyOnceWith(readClient, { dataSetId: 1n })
  expect(createContexts).toHaveBeenCalledTimes(3)
  expect(freshContexts).not.toHaveBeenCalled()
  expect(prepare).toHaveBeenCalledWith({ context: healthy, pieceSizes: [10n] })
})

it('selects two fresh copies when every candidate is confirmed dead', async () => {
  const createContexts = vi.fn().mockRejectedValue(new Error('Dataset unavailable'))
  const fresh = [{ provider: { id: 4n } }, { provider: { id: 2n } }]
  freshContexts.mockResolvedValueOnce(fresh)
  live.mockResolvedValue(false)
  const prepare = vi.fn().mockResolvedValue({ costs: { ready: true } })
  const synapse = { storage: { createContexts, prepare } } as unknown as Synapse
  expect(await prepareUploadContexts(synapse, 10n, { dataSetIds: [1n, 2n] })).toEqual(fresh)
  expect(freshContexts).toHaveBeenCalledExactlyOnceWith(synapse, expect.any(String), 2, [])
  expect(prepare).toHaveBeenCalledWith({ context: fresh, pieceSizes: [10n] })
})

it.each(['live', 'unknown'] as const)('preserves resolution errors when liveness is %s', async (state) => {
  const error = new Error('metadata RPC unavailable')
  const createContexts = vi.fn().mockRejectedValue(error)
  if (state === 'live') live.mockResolvedValueOnce(true)
  else live.mockRejectedValueOnce(new Error('liveness RPC unavailable'))
  const prepare = vi.fn()
  const synapse = { storage: { createContexts, prepare } } as unknown as Synapse
  await expect(prepareUploadContexts(synapse, 10n, { dataSetIds: [1n] })).rejects.toBe(error)
  expect(freshContexts).not.toHaveBeenCalled()
  expect(prepare).not.toHaveBeenCalled()
})
