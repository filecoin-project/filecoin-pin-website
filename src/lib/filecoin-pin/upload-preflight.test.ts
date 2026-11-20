import type { Synapse } from '@filoz/synapse-sdk'
import { beforeEach, expect, it, vi } from 'vitest'
import { addStoredDataSetId } from '../local-storage/data-set.ts'
import { UploadFundingRequired } from './upload-funding.ts'
import { preflightUpload } from './upload-preflight.ts'

const { gas, validateGas, fresh } = vi.hoisted(() => ({ gas: vi.fn(), validateGas: vi.fn(), fresh: vi.fn() }))
vi.mock('filecoin-pin/core/payments', () => ({ checkFILBalance: gas, validateGasRequirement: validateGas }))
vi.mock('./fresh-contexts.ts', () => ({ createFreshUploadContexts: fresh }))
vi.mock('./storage-chain.ts', () => ({ assertCurrentStorageChain: vi.fn() }))

const scope = '314:0x1111111111111111111111111111111111111111'
const metadata = { 'foc/enc': '1', 'foc/gkid': 'group', 'foc/kc': 'commitment' }
const contexts = [4n, 5n].map((id) => ({
  provider: { id },
  dataSetId: id + 10n,
  dataSetMetadata: { source: 'filecoin-drive', ...metadata },
}))
const prepare = vi.fn()
const createContexts = vi.fn()
const ensurePermissions = vi.fn()
const execute = vi.fn()
const synapse = { storage: { prepare, createContexts } } as unknown as Synapse
const options = { storageScope: scope, providerId: null, metadata, sourceSizes: [1000, 2000], ensurePermissions }

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  ensurePermissions.mockResolvedValue(undefined)
  gas.mockResolvedValue({ balance: 10n ** 18n, isCalibnet: false })
  validateGas.mockReturnValue({ isValid: true })
  fresh.mockResolvedValue(contexts)
  prepare.mockResolvedValue({ costs: { ready: true }, transaction: null })
})

it('quotes the selected batch and both copies using fresh chain reads on every attempt', async () => {
  await preflightUpload(synapse, options)
  prepare.mockResolvedValueOnce({
    costs: { ready: false, depositNeeded: 10n ** 18n, needsFwssMaxApproval: false },
    transaction: { execute },
  })
  await expect(preflightUpload(synapse, options)).rejects.toBeInstanceOf(UploadFundingRequired)
  expect(ensurePermissions).toHaveBeenCalledTimes(2)
  expect(gas).toHaveBeenCalledTimes(2)
  expect(prepare).toHaveBeenCalledTimes(2)
  expect(prepare).toHaveBeenLastCalledWith({ context: contexts, pieceSizes: [1000n, 2000n], extraRunwayEpochs: 20160n })
  expect(execute).not.toHaveBeenCalled()
})

it('uses matching existing encrypted datasets instead of charging for fresh ones', async () => {
  addStoredDataSetId(scope, 14)
  addStoredDataSetId(scope, 15)
  createContexts.mockImplementation(async ({ dataSetIds }: { dataSetIds: bigint[] }) =>
    contexts.filter((context) => dataSetIds.includes(context.dataSetId))
  )
  await preflightUpload(synapse, options)
  expect(fresh).not.toHaveBeenCalled()
  expect(prepare).toHaveBeenCalledWith({ context: contexts, pieceSizes: [1000n, 2000n], extraRunwayEpochs: 20160n })
})

it('lets the SDK decide whether existing reserves cover the upload', async () => {
  // No independent total-deposit or arbitrary available-balance threshold.
  await expect(preflightUpload(synapse, options)).resolves.toEqual(contexts)
  prepare.mockResolvedValueOnce({
    costs: { ready: false, depositNeeded: 0n, needsFwssMaxApproval: true },
    transaction: { execute },
  })
  await expect(preflightUpload(synapse, options)).rejects.toMatchObject({ depositNeeded: 0n, needsApproval: true })
  expect(execute).not.toHaveBeenCalled()
})

it('stops before provider selection or quoting when the session is revoked', async () => {
  ensurePermissions.mockRejectedValueOnce(new Error('Upload session expired or was revoked.'))
  await expect(preflightUpload(synapse, options)).rejects.toThrow('revoked')
  expect(gas).not.toHaveBeenCalled()
  expect(fresh).not.toHaveBeenCalled()
  expect(prepare).not.toHaveBeenCalled()
})

it('stops before quoting when current gas is insufficient', async () => {
  gas.mockResolvedValueOnce({ balance: 0n, isCalibnet: false })
  validateGas.mockReturnValueOnce({ isValid: false, errorMessage: 'Insufficient FIL.' })
  await expect(preflightUpload(synapse, options)).rejects.toMatchObject({ code: 'gas' })
  expect(validateGas).toHaveBeenCalledWith(0n, false)
  expect(fresh).not.toHaveBeenCalled()
  expect(prepare).not.toHaveBeenCalled()
})

it('preserves read failures rather than treating them as a funding success', async () => {
  prepare.mockRejectedValueOnce(new Error('Payment RPC unavailable'))
  await expect(preflightUpload(synapse, options)).rejects.toThrow('Payment RPC unavailable')
})

it('quotes empty files as nonzero pieces without reading or packing their bytes', async () => {
  await preflightUpload(synapse, { ...options, sourceSizes: [0] })
  expect(prepare).toHaveBeenCalledWith({ context: contexts, pieceSizes: [1n], extraRunwayEpochs: 20160n })
})

it('preserves explicit provider targeting and encryption metadata', async () => {
  createContexts.mockResolvedValueOnce(contexts)
  await preflightUpload(synapse, { ...options, providerId: 4n })
  expect(fresh).not.toHaveBeenCalled()
  expect(createContexts).toHaveBeenCalledWith({
    withCDN: false,
    providerIds: [4n],
    metadata: { withIPFSIndexing: '', source: 'filecoin-drive', clientId: expect.any(String), ...metadata },
  })
})

it('retains the upload path fallback if direct provider selection fails', async () => {
  fresh.mockRejectedValueOnce(new Error('Registry selection unavailable'))
  createContexts.mockResolvedValueOnce(contexts)
  await preflightUpload(synapse, options)
  expect(createContexts).toHaveBeenCalledWith({
    withCDN: false,
    providerIds: undefined,
    metadata: { withIPFSIndexing: '', source: 'filecoin-drive', clientId: expect.any(String), ...metadata },
  })
  expect(prepare).toHaveBeenCalledWith({ context: contexts, pieceSizes: [1000n, 2000n], extraRunwayEpochs: 20160n })
})
