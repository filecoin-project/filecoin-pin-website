import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// vitest's jsdom environment overwrites the typed-array intrinsics with the
// jsdom realm's constructors, while Node APIs (TextEncoder, WebCrypto, the
// Buffer-backed cborg fast path) keep returning Node-realm arrays. instanceof
// checks inside FEE and uint8arrays then fail or mis-allocate, corrupting CAR
// bytes. Restore the Node intrinsics before any dependency captures a global.
vi.hoisted(() => {
  const nodeUint8Array = Object.getPrototypeOf(Object.getPrototypeOf(Buffer.alloc(0))).constructor
  const globals: Record<string, unknown> = globalThis
  globals.Uint8Array = nodeUint8Array
  globals.ArrayBuffer = Buffer.alloc(0).buffer.constructor
})

const {
  executeUploadMock,
  prepareUploadInputMock,
  useFilecoinPinContextMock,
  createFreshUploadContextsMock,
  createContextsMock,
  prepareMock,
  dataSetLiveMock,
  cacheDirectoryUploadMock,
} = vi.hoisted(() => ({
  executeUploadMock: vi.fn(),
  prepareUploadInputMock: vi.fn(),
  useFilecoinPinContextMock: vi.fn(),
  createFreshUploadContextsMock: vi.fn(),
  createContextsMock: vi.fn(),
  prepareMock: vi.fn(),
  dataSetLiveMock: vi.fn(),
  cacheDirectoryUploadMock: vi.fn(),
}))

vi.mock('../lib/filecoin-pin/storage-chain.ts', () => ({ assertCurrentStorageChain: vi.fn() }))
vi.mock('@filoz/synapse-core/pdp-verifier', async (original) => ({
  ...(await original<object>()),
  dataSetLive: dataSetLiveMock,
}))

vi.mock('filecoin-pin/core/payments', () => ({
  checkFILBalance: vi.fn().mockResolvedValue({ balance: 10n ** 18n, isCalibnet: false }),
  validateGasRequirement: vi.fn().mockReturnValue({ isValid: true }),
}))

vi.mock('filecoin-pin/core/upload', () => ({
  executeUpload: executeUploadMock,
}))

// Vitest resolves the Node export of filecoin-pin, which lacks the browser CAR
// builders; load the browser build the production bundle actually uses.
vi.mock('filecoin-pin/core/unixfs', async () => import('../../node_modules/filecoin-pin/dist/core/unixfs/browser.js'))

vi.mock('../lib/filecoin-pin/upload-input.ts', () => ({
  prepareUploadInput: prepareUploadInputMock,
}))

vi.mock('./use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: useFilecoinPinContextMock,
}))

vi.mock('../lib/filecoin-pin/synapse.ts', () => ({
  APPLICATION_SOURCE: 'filecoin-drive',
  ensureSessionKeyPermissions: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/filecoin-pin/fresh-contexts.ts', () => ({
  createFreshUploadContexts: createFreshUploadContextsMock,
}))

vi.mock('../lib/filecoin-pin/directory.ts', () => ({
  cacheDirectoryUpload: cacheDirectoryUploadMock,
  zipDirectory: vi.fn(),
}))

import { CommitError, StoreError } from '@filoz/synapse-sdk'
import { CarReader } from '@ipld/car'
import { createCarFromFile } from 'filecoin-pin/core/unixfs'
import { exporter } from 'ipfs-unixfs-exporter'
import type { CID } from 'multiformats/cid'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { MAX_FILE_SIZE } from '../constants/files.ts'
import { acquireContentLock } from '../lib/filecoin-pin/content-lock.ts'
import { wrapCarPayload } from '../lib/filecoin-pin/encrypted-payload.ts'
import {
  decryptEnvelope,
  encryptedDataSetMetadata,
  grantKeyResolver,
  isEncryptionEnvelope,
  issueEncryptionCredential,
} from '../lib/filecoin-pin/encryption.ts'
import { addStoredDataSetId, getStoredDataSetIds } from '../lib/local-storage/data-set.ts'
import { getCachedPieces, setCachedPieces } from '../lib/local-storage/piece-cache.ts'
import { useFilecoinUpload } from './use-filecoin-upload.ts'

// jsdom's Blob/File lack stream(), which the real encrypt and CAR-packing paths
// pipe through. Bridge it from arrayBuffer(), which jsdom does implement.
if (typeof Blob.prototype.stream !== 'function') {
  Blob.prototype.stream = function (this: Blob) {
    const bytes = this.arrayBuffer()
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async start(controller) {
        controller.enqueue(new Uint8Array(await bytes))
        controller.close()
      },
    })
  }
}

// Real crypto: a deterministic owner account issues a real grant to a real session key,
// so the hook's encrypt step and the tests' decrypt assertions exercise the actual envelope format.
const sessionPrivateKey = generatePrivateKey()
const ownerAccount = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
const credential = await issueEncryptionCredential(
  { address: ownerAccount.address, signTypedData: ((args: never) => ownerAccount.signTypedData(args)) as never },
  sessionPrivateKey
)

/** Extract the single UnixFS file carried by a CAR (the FEE envelope of an encrypted upload). */
async function unpackSingleFile(carBytes: Uint8Array): Promise<{ root: CID; content: Uint8Array }> {
  const reader = await CarReader.fromBytes(carBytes)
  const roots = await reader.getRoots()
  expect(roots).toHaveLength(1)
  const blockstore = {
    get: async function* (cid: CID) {
      const block = await reader.get(cid)
      if (!block) throw new Error('Missing block in outer CAR')
      yield block.bytes
    },
  }
  const entry = await exporter(roots[0].toString(), blockstore as never)
  if (entry.type !== 'file' && entry.type !== 'raw' && entry.type !== 'identity')
    throw new Error('Expected a single file in the outer CAR')
  const chunks: Uint8Array[] = []
  for await (const chunk of entry.content()) chunks.push(new Uint8Array(chunk))
  const content = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    content.set(chunk, offset)
    offset += chunk.length
  }
  return { root: roots[0], content }
}

const baseContext = {
  synapse: { storage: { createContexts: createContextsMock, prepare: prepareMock } },
  wallet: { status: 'ready', data: { address: '0xabc', network: 'calibration' } },
  addDataSetId: vi.fn(),
  debugParams: { providerId: null, dataSetId: null },
  encryption: { ready: true, sessionPrivateKey, credential },
}

const testFile = new File(['hello'], 'a.txt')
// Real CAR for the hook's payload wrapping (fake bytes would fail CAR parsing);
// the expected payload root is derived once by the same profile builder the
// oracle tests (encrypted-payload.test.ts) prove against the filecoin-pin CLI.
const baseCar = await createCarFromFile(new File(['hello'], 'a.txt'))
const payloadRoot = (await wrapCarPayload(baseCar, 'a.txt')).rootCid

const fakeContexts = [
  { provider: { id: 4n, name: 'provider-a' }, dataSetMetadata: { source: 'filecoin-drive' } },
  { provider: { id: 2n, name: 'provider-b' }, dataSetMetadata: { source: 'filecoin-drive' } },
]

beforeEach(() => {
  vi.clearAllMocks()
  dataSetLiveMock.mockReset()
  localStorage.clear()
  prepareUploadInputMock.mockResolvedValue({
    rootCid: baseCar.rootCid,
    carBytes: baseCar.carBytes,
  })
  executeUploadMock.mockResolvedValue({ copies: [], network: 'calibration' })
  createFreshUploadContextsMock.mockResolvedValue(fakeContexts)
  createContextsMock.mockResolvedValue(fakeContexts)
  prepareMock.mockResolvedValue({ costs: { ready: true } })
})

it('refuses uploads before packing when safe directory writes are unavailable', async () => {
  useFilecoinPinContextMock.mockReturnValue(baseContext)
  const locks = navigator.locks
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  try {
    const { result } = renderHook(useFilecoinUpload)
    await act(async () => {
      await expect(result.current.uploadFile(testFile)).rejects.toThrow('cannot safely update the file directory')
    })
    expect(prepareUploadInputMock).not.toHaveBeenCalled()
    expect(executeUploadMock).not.toHaveBeenCalled()
    expect(result.current.uploadState.isUploading).toBe(false)
  } finally {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: locks })
  }
})
it('refuses an upload whose encrypted, wrapped bytes exceed the 200 MB limit even though the raw file does not', {
  timeout: 60_000,
}, async () => {
  useFilecoinPinContextMock.mockReturnValue(baseContext)
  // Packing + the FEE envelope + the outer wrapper add real overhead on
  // top of the plaintext (~46 KB measured for a ~198 MB upload) — a raw
  // file sized just under the limit can still produce an over-limit
  // upload once encrypted. Real random bytes: an all-zero buffer chunks
  // down to near-nothing via content-addressed dedup and would not
  // reproduce this.
  const size = MAX_FILE_SIZE - 30_000
  const bytes = new Uint8Array(size)
  for (let i = 0; i < bytes.length; i += 65536)
    crypto.getRandomValues(bytes.subarray(i, Math.min(i + 65536, bytes.length)))
  const bigFile = new File([bytes], 'big.bin')
  const carResult = await createCarFromFile(bigFile)
  prepareUploadInputMock.mockResolvedValueOnce({ rootCid: carResult.rootCid, carBytes: carResult.carBytes })
  const { result } = renderHook(useFilecoinUpload)
  await act(async () => {
    await expect(result.current.uploadFile(bigFile)).rejects.toThrow(/200 MB browser upload limit/)
  })
  expect(executeUploadMock).not.toHaveBeenCalled()
})

describe('useFilecoinUpload readiness', () => {
  it('stops before transferring when SDK preparation fails', async () => {
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    prepareMock.mockRejectedValueOnce(new Error('Insufficient storage funds'))

    const { result } = renderHook(() => useFilecoinUpload())

    await expect(result.current.uploadFile(testFile)).rejects.toThrow('Insufficient storage funds')
    expect(executeUploadMock).not.toHaveBeenCalled()
  })
})

describe('useFilecoinUpload providerId debug param', () => {
  const getOpts = () => executeUploadMock.mock.lastCall?.at(-1)

  it('resolves the requested provider before executing with explicit contexts', async () => {
    useFilecoinPinContextMock.mockReturnValue({
      ...baseContext,
      debugParams: { providerId: 6n, dataSetId: null },
    })

    const { result } = renderHook(() => useFilecoinUpload())
    await result.current.uploadFile(testFile)

    expect(executeUploadMock).toHaveBeenCalledTimes(1)
    expect(createContextsMock).toHaveBeenCalledWith(expect.objectContaining({ providerIds: [6n] }))
    expect(getOpts()).toMatchObject({ contexts: fakeContexts })
    expect(getOpts()).not.toHaveProperty('providerIds')
  })

  it('omits providerIds when debugParams.providerId is null so Synapse auto-selects', async () => {
    useFilecoinPinContextMock.mockReturnValue({
      ...baseContext,
      debugParams: { providerId: null, dataSetId: null },
    })

    const { result } = renderHook(() => useFilecoinUpload())
    await result.current.uploadFile(testFile)

    expect(executeUploadMock).toHaveBeenCalledTimes(1)
    expect(getOpts()).not.toHaveProperty('providerIds')
  })
})

describe('useFilecoinUpload dataset resume', () => {
  const getOpts = () => executeUploadMock.mock.lastCall?.at(-1)

  it('blocks provider upload when the multi-copy quote requires additional funds', async () => {
    addStoredDataSetId('0xabc', 42)
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    const fund = vi.fn()
    prepareMock.mockResolvedValue({
      costs: { ready: false, depositNeeded: 10n ** 18n, needsFwssMaxApproval: false },
      transaction: { execute: fund },
    })
    const { result } = renderHook(() => useFilecoinUpload())
    await act(async () => {
      await expect(result.current.uploadFile(testFile)).rejects.toThrow('1 more USDFC')
    })
    expect(executeUploadMock).not.toHaveBeenCalled()
    expect(fund).not.toHaveBeenCalled()
    expect(result.current.uploadState.stepStates.some((step) => step.status === 'in-progress')).toBe(false)
    expect(result.current.uploadState.stepStates.find((step) => step.step === 'checking-readiness')?.status).toBe(
      'pending'
    )
    expect(getStoredDataSetIds('0xabc')).toEqual([42])
  })

  it('resolves stored dataset IDs once and executes the quoted contexts without conflicting selectors', async () => {
    addStoredDataSetId('0xabc', 42)
    addStoredDataSetId('0xabc', 77)
    useFilecoinPinContextMock.mockReturnValue(baseContext)

    const { result } = renderHook(() => useFilecoinUpload())
    await result.current.uploadFile(testFile)

    expect(executeUploadMock).toHaveBeenCalledTimes(1)
    expect(createContextsMock).toHaveBeenCalledWith({ withCDN: false, dataSetIds: [42n] })
    expect(getOpts()).toMatchObject({ contexts: fakeContexts })
    expect(getOpts()).not.toHaveProperty('dataSetIds')
    // Resume reuses existing data sets, but a partial resume may still create
    // fresh ones; the options carry the encrypted data-set metadata for that case.
    expect(getOpts()?.metadata).toEqual(encryptedDataSetMetadata(credential))
  })

  it('uses fresh contexts (no smart-select) when no dataset ids are stored', async () => {
    useFilecoinPinContextMock.mockReturnValue(baseContext)

    const { result } = renderHook(() => useFilecoinUpload())
    await result.current.uploadFile(testFile)

    expect(createFreshUploadContextsMock).toHaveBeenCalledTimes(1)
    expect(executeUploadMock).toHaveBeenCalledTimes(1)
    expect(getOpts()).toMatchObject({ contexts: fakeContexts })
    expect(getOpts()).not.toHaveProperty('dataSetIds')
    expect(getOpts()).not.toHaveProperty('metadata')
  })

  it('falls back to smart-select with clientId metadata when fresh context selection fails', async () => {
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    createFreshUploadContextsMock.mockRejectedValueOnce(new Error('No reachable storage providers available'))

    const { result } = renderHook(() => useFilecoinUpload())
    await result.current.uploadFile(testFile)

    expect(executeUploadMock).toHaveBeenCalledTimes(1)
    expect(getOpts()?.contexts).toBe(fakeContexts)
    expect(createContextsMock).toHaveBeenCalledTimes(1)
    expect(getOpts()?.metadata?.clientId).toBeTruthy()
  })

  it('clears unusable dataset ids while preserving the file directory, then retries with fresh contexts', async () => {
    addStoredDataSetId('0xabc', 42)
    setCachedPieces('0xabc', [{ pieceCid: 'bafkstale' } as never])
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    executeUploadMock
      .mockRejectedValueOnce(new Error('Data set 42 does not exist'))
      .mockResolvedValueOnce({ copies: [], network: 'calibration' })

    const { result } = renderHook(() => useFilecoinUpload())
    await result.current.uploadFile(testFile)

    expect(executeUploadMock).toHaveBeenCalledTimes(2)
    expect(getOpts()).not.toHaveProperty('dataSetIds')
    expect(getOpts()).toMatchObject({ contexts: fakeContexts })
    expect(getStoredDataSetIds('0xabc')).toEqual([])
    expect(getCachedPieces('0xabc')).toEqual([{ pieceCid: 'bafkstale' }])
  })

  it('rethrows resolution-like errors that occur after upload progress started', async () => {
    addStoredDataSetId('0xabc', 42)
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    executeUploadMock.mockImplementationOnce(async (_synapse, _car, _root, opts) => {
      opts.onProgress?.({ type: 'stored', data: { providerId: 4n, pieceCid: { toString: () => 'bafkpiece' } } })
      throw new Error('Rail 7 does not exist or is inactive')
    })

    const { result } = renderHook(() => useFilecoinUpload())
    await expect(result.current.uploadFile(testFile)).rejects.toThrow('does not exist')

    expect(executeUploadMock).toHaveBeenCalledTimes(1)
    expect(getStoredDataSetIds('0xabc')).toEqual([42])
  })

  it('rethrows non-resolution upload errors without retrying', async () => {
    addStoredDataSetId('0xabc', 42)
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    executeUploadMock.mockRejectedValueOnce(new Error('network timeout'))

    const { result } = renderHook(() => useFilecoinUpload())
    await expect(result.current.uploadFile(testFile)).rejects.toThrow('network timeout')

    expect(executeUploadMock).toHaveBeenCalledTimes(1)
  })

  it('recreates data sets when a stored dataset resolves but its provider is offline', async () => {
    // The dataset resolves (callbacks fire) but the provider is offline, so the
    // store throws a StoreError before any bytes land. Without recovery every
    // later upload from this browser re-resolves the same dead provider and
    // fails.
    addStoredDataSetId('0xabc', 42)
    setCachedPieces('0xabc', [{ pieceCid: 'bafkstale' } as never])
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    executeUploadMock
      .mockImplementationOnce(async (_synapse, _car, _root, opts) => {
        opts.onProgress?.({ type: 'dataSetResolved', data: { dataSetId: 42n, provider: { id: 4n, name: 'p' } } })
        throw new StoreError('Failed to store on primary provider 4', { providerId: 4n, endpoint: 'https://p' })
      })
      .mockResolvedValueOnce({ copies: [], network: 'calibration' })

    const { result } = renderHook(() => useFilecoinUpload())
    await result.current.uploadFile(testFile)

    expect(executeUploadMock).toHaveBeenCalledTimes(2)
    expect(getOpts()).toMatchObject({ contexts: fakeContexts })
    expect(getOpts()).not.toHaveProperty('dataSetIds')
    expect(getStoredDataSetIds('0xabc')).toEqual([])
    expect(getCachedPieces('0xabc')).toEqual([{ pieceCid: 'bafkstale' }])
  })

  it('rethrows a StoreError that occurs after bytes are stored without recreating data sets', async () => {
    // After a copy lands (stored event), a later store or commit failure means
    // the upload progressed past resolution, so it must not recreate datasets.
    addStoredDataSetId('0xabc', 42)
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    executeUploadMock.mockImplementationOnce(async (_synapse, _car, _root, opts) => {
      opts.onProgress?.({ type: 'stored', data: { providerId: 4n, pieceCid: { toString: () => 'bafkpiece' } } })
      throw new CommitError('secondary copy commit failed', { providerId: 4n, endpoint: 'https://p' })
    })

    const { result } = renderHook(() => useFilecoinUpload())
    await expect(result.current.uploadFile(testFile)).rejects.toThrow('secondary copy commit failed')

    expect(executeUploadMock).toHaveBeenCalledTimes(1)
    expect(getStoredDataSetIds('0xabc')).toEqual([42])
  })

  it('prefers debug providerId over stored dataset ids', async () => {
    addStoredDataSetId('0xabc', 42)
    useFilecoinPinContextMock.mockReturnValue({
      ...baseContext,
      debugParams: { providerId: 6n, dataSetId: null },
    })

    const { result } = renderHook(() => useFilecoinUpload())
    await result.current.uploadFile(testFile)

    expect(createContextsMock).toHaveBeenCalledWith(expect.objectContaining({ providerIds: [6n] }))
    expect(getOpts()).toMatchObject({ contexts: fakeContexts })
    expect(getOpts()).not.toHaveProperty('providerIds')
    expect(getOpts()).not.toHaveProperty('dataSetIds')
  })
})

it('restores two-copy uploads after a one-copy result without changing existing file records', async () => {
  const scope = '314159:0x1111111111111111111111111111111111111111'
  const [primary, secondary] = fakeContexts
  addStoredDataSetId(scope, 44585)
  const oldFile = { id: 'old-file', datasetId: '44585', datasetIds: ['44585'], copyCount: 1 }
  setCachedPieces(scope, [oldFile as never])
  useFilecoinPinContextMock.mockReturnValue({ ...baseContext, storageScope: scope })
  createContextsMock.mockImplementation(async ({ dataSetIds }) => (dataSetIds[0] === 44585n ? [primary] : [secondary]))
  createFreshUploadContextsMock.mockResolvedValueOnce([secondary])
  executeUploadMock.mockImplementation(async (_synapse, _car, _root, options) => {
    for (const [index, context] of options.contexts.entries()) {
      options.onProgress({
        type: 'piecesConfirmed',
        data: { dataSetId: BigInt(44585 + index), providerId: context.provider.id, pieceIds: [1n] },
      })
    }
    return {
      requestedCopies: 2,
      copies: options.contexts.map((context: (typeof fakeContexts)[number], index: number) => ({
        role: index === 0 ? 'primary' : 'secondary',
        providerId: context.provider.id,
        dataSetId: BigInt(44585 + index),
        pieceId: 1n,
      })),
    }
  })
  const { result } = renderHook(useFilecoinUpload)
  await act(async () => {
    await result.current.uploadFile(testFile)
  })
  expect(createFreshUploadContextsMock).toHaveBeenCalledWith(
    baseContext.synapse,
    expect.any(String),
    1,
    [4n],
    encryptedDataSetMetadata(credential)
  )
  const outerCarLength = (executeUploadMock.mock.lastCall?.[1] as Uint8Array | undefined)?.length ?? 0
  expect(prepareMock).toHaveBeenLastCalledWith({
    context: [primary, secondary],
    pieceSizes: [BigInt(outerCarLength)],
  })
  expect(executeUploadMock.mock.lastCall?.[3].contexts).toEqual([primary, secondary])
  expect(getStoredDataSetIds(scope)).toEqual([44585, 44586])
  await act(async () => {
    await result.current.uploadFile(testFile)
  })
  expect(createFreshUploadContextsMock).toHaveBeenCalledOnce()
  expect(createContextsMock).toHaveBeenLastCalledWith({ withCDN: false, dataSetIds: [44586n] })
  expect(result.current.uploadState.copies).toHaveLength(2)
  expect(getCachedPieces(scope)).toEqual([oldFile])
})

it('retries the two-copy target on every upload when no additional provider is reachable', async () => {
  const scope = '314159:0x1111111111111111111111111111111111111111'
  addStoredDataSetId(scope, 44585)
  useFilecoinPinContextMock.mockReturnValue({ ...baseContext, storageScope: scope })
  createContextsMock.mockResolvedValue([fakeContexts[0]])
  createFreshUploadContextsMock.mockResolvedValue([])
  executeUploadMock.mockResolvedValue({ requestedCopies: 1, copies: [{ role: 'primary', providerId: 4n }] })
  const { result } = renderHook(useFilecoinUpload)
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(async () => {
      await result.current.uploadFile(testFile)
    })
    expect(result.current.uploadState.expectedCopies).toBe(2)
    expect(result.current.uploadState.confirmedCopies).toBe(1)
    expect(result.current.uploadState.stepStates.find((step) => step.step === 'replicating')).toMatchObject({
      status: 'error',
      error: 'Stored with 1 of 2 storage copies.',
    })
  }
  expect(createFreshUploadContextsMock).toHaveBeenCalledTimes(2)
  expect(getStoredDataSetIds(scope)).toEqual([44585])
})

it('completes the announce step on the first provider sync and keeps later announce failures from downgrading it', async () => {
  useFilecoinPinContextMock.mockReturnValue(baseContext)
  executeUploadMock.mockImplementationOnce(async (_synapse, _car, _root, options) => {
    options.onProgress?.({
      type: 'pieceSyncStatus:providerSynced',
      data: { serviceURL: 'https://a.example', providerIndex: 1, providerCount: 2 },
    })
    options.onProgress?.({
      type: 'pieceSyncStatus:failed',
      data: { error: new Error('not synced on https://b.example after 20 attempts'), providerCount: 2 },
    })
    options.onProgress?.({
      type: 'indexingConfirmation:mismatch',
      data: { error: new Error('indexer lookup disagreed') },
    })
    return { copies: [], network: 'calibration' }
  })
  const { result } = renderHook(useFilecoinUpload)
  await act(async () => {
    await result.current.uploadFile(testFile)
  })
  expect(result.current.uploadState.stepStates.find((step) => step.step === 'announcing-cids')).toMatchObject({
    status: 'completed',
    progress: 100,
  })
})

it('reports an announce failure when no authoritative indexing signal passed', async () => {
  useFilecoinPinContextMock.mockReturnValue(baseContext)
  executeUploadMock.mockImplementationOnce(async (_synapse, _car, _root, options) => {
    options.onProgress?.({
      type: 'pieceSyncStatus:failed',
      data: { error: new Error('not synced anywhere'), providerCount: 1 },
    })
    return { copies: [], network: 'calibration' }
  })
  const { result } = renderHook(useFilecoinUpload)
  await act(async () => {
    await result.current.uploadFile(testFile)
  })
  expect(result.current.uploadState.stepStates.find((step) => step.step === 'announcing-cids')).toMatchObject({
    status: 'error',
  })
})

it('keeps the selected copy count while only the first provider has submitted', async () => {
  useFilecoinPinContextMock.mockReturnValue(baseContext)
  let complete!: () => void
  executeUploadMock.mockImplementation(async (_synapse, _car, _root, options) => {
    options.onProgress({ type: 'piecesAdded', data: { providerId: 4n, txHash: '0xfirst' } })
    await new Promise<void>((resolve) => {
      complete = resolve
    })
    options.onProgress({ type: 'piecesAdded', data: { providerId: 2n, txHash: '0xsecond' } })
    return { requestedCopies: 2, copies: [{ providerId: 4n }, { providerId: 2n }] }
  })
  const { result } = renderHook(useFilecoinUpload)
  let upload!: Promise<unknown>
  act(() => {
    upload = result.current.uploadFile(testFile)
  })
  await waitFor(() => expect(result.current.uploadState.transactionHashes).toEqual(['0xfirst']))
  expect(result.current.uploadState.expectedCopies).toBe(2)
  await act(async () => {
    complete()
    await upload
  })
  expect(result.current.uploadState.expectedCopies).toBe(2)
})

it('rejects an identical upload before permissions, funding or sending data when deletion holds the lock', async () => {
  const scope = '314159:0xabc'
  useFilecoinPinContextMock.mockReturnValue({ ...baseContext, storageScope: scope })
  const release = await acquireContentLock(scope, payloadRoot)
  const { result } = renderHook(useFilecoinUpload)
  try {
    await act(async () => {
      await expect(result.current.uploadFile(testFile)).rejects.toThrow('Retry after')
    })
    expect(prepareUploadInputMock).toHaveBeenCalledOnce()
    expect(executeUploadMock).not.toHaveBeenCalled()
  } finally {
    await release()
  }
  await act(async () => {
    await result.current.uploadFile(testFile)
  })
  expect(executeUploadMock).toHaveBeenCalledOnce()
})

it.each([{ deletion: {} }, { datasetIds: ['1', '2'], removalQueuedCopies: ['1'] }])(
  'requires an unfinished local or indexed deletion to be resumed before reuploading the same content: %j',
  async (progress) => {
    const scope = '314159:0xabc'
    const file = { id: 'pending-delete', cid: payloadRoot, datasetId: '1', ...progress }
    setCachedPieces(scope, [file as never])
    useFilecoinPinContextMock.mockReturnValue({ ...baseContext, storageScope: scope })
    const { result } = renderHook(useFilecoinUpload)
    await act(async () => {
      await expect(result.current.uploadFile(testFile)).rejects.toThrow('unfinished deletion')
    })
    expect(executeUploadMock).not.toHaveBeenCalled()
    setCachedPieces(scope, [
      {
        ...file,
        removedCopies: 'datasetIds' in file ? file.datasetIds : ['1'],
        deletion: { '1': { confirmed: true, transactionHash: '0xabc' } },
      } as never,
    ])
    await act(async () => {
      await result.current.uploadFile(testFile)
    })
    expect(executeUploadMock).toHaveBeenCalledOnce()
  }
)

it('records the immutable file name and normalized path in the three piece metadata slots', async () => {
  useFilecoinPinContextMock.mockReturnValue(baseContext)
  const { result } = renderHook(useFilecoinUpload)
  await act(async () => {
    await result.current.uploadFile(testFile, { path: '/reports//2026/' })
  })
  expect(executeUploadMock.mock.lastCall?.[3].pieceMetadata).toEqual({ label: 'a.txt', path: 'reports/2026' })
})

it('preserves the original CAR download mode through its path metadata key', async () => {
  useFilecoinPinContextMock.mockReturnValue(baseContext)
  prepareUploadInputMock.mockResolvedValue({
    rootCid: baseCar.rootCid,
    carBytes: baseCar.carBytes,
    importedCar: true,
  })
  const { result } = renderHook(useFilecoinUpload)
  await act(async () => {
    await result.current.uploadFile(testFile, { path: 'archives' })
  })
  expect(executeUploadMock.mock.lastCall?.[3].pieceMetadata).toEqual({ label: 'a.txt', carPath: 'archives' })
})

it('rejects metadata that cannot be restored before packing or contacting a provider', async () => {
  useFilecoinPinContextMock.mockReturnValue(baseContext)
  const { result } = renderHook(useFilecoinUpload)
  await act(async () => {
    await expect(result.current.uploadFile(new File(['x'], '中'.repeat(33)))).rejects.toThrow('96 UTF-8')
  })
  expect(prepareUploadInputMock).not.toHaveBeenCalled()
  expect(executeUploadMock).not.toHaveBeenCalled()
})

it.each(['resolution', 'quote'] as const)(
  'does not clear candidates or retry uploads for failed %s reads',
  async (stage) => {
    addStoredDataSetId('0xabc', 42)
    setCachedPieces('0xabc', [{ pieceCid: 'history' } as never])
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    const error = new Error('RPC method does not exist')
    if (stage === 'resolution') {
      createContextsMock.mockRejectedValueOnce(error)
      dataSetLiveMock.mockRejectedValueOnce(new Error('RPC unavailable'))
    } else prepareMock.mockRejectedValueOnce(error)
    const { result } = renderHook(useFilecoinUpload)
    await expect(result.current.uploadFile(testFile)).rejects.toBe(error)
    expect(executeUploadMock).not.toHaveBeenCalled()
    expect(createFreshUploadContextsMock).not.toHaveBeenCalled()
    expect(getStoredDataSetIds('0xabc')).toEqual([42])
    expect(getCachedPieces('0xabc')).toEqual([{ pieceCid: 'history' }])
  }
)

it('does not let a pre-transfer interrupted record block unrelated uploads', async () => {
  const scope = '314159:0xabc'
  useFilecoinPinContextMock.mockReturnValue({ ...baseContext, storageScope: scope })
  setCachedPieces(scope, [
    {
      id: 'interrupted-before-packing',
      cid: '',
      pieceCid: '',
      upload: { phase: 'interrupted', providers: [], expectedCopies: 2, steps: [], checks: 0, nextCheckAt: 0 },
    } as never,
  ])
  const { result } = renderHook(useFilecoinUpload)
  await act(async () => {
    await result.current.uploadFile(testFile)
  })
  expect(executeUploadMock).toHaveBeenCalledOnce()
})

it('keeps the actual quoted copy count when funding is missing', async () => {
  useFilecoinPinContextMock.mockReturnValue(baseContext)
  createFreshUploadContextsMock.mockResolvedValueOnce([fakeContexts[0]])
  prepareMock.mockResolvedValueOnce({ costs: { ready: false, depositNeeded: 1n, needsFwssMaxApproval: false } })
  const { result } = renderHook(useFilecoinUpload)
  await act(async () => {
    await expect(result.current.uploadFile(testFile)).rejects.toThrow('1 storage copies')
  })
  expect(result.current.uploadState.expectedCopies).toBe(1)
  expect(result.current.uploadState.funding).toEqual({ depositNeeded: '1', needsApproval: false })
  expect(executeUploadMock).not.toHaveBeenCalled()
})

describe('useFilecoinUpload encrypts by default', () => {
  const getOpts = () => executeUploadMock.mock.lastCall?.at(-1)
  // An in-flight upload record shape, as the orchestration layer checkpoints it.
  const inFlightUpload = { phase: 'uploading', providers: [], expectedCopies: 2, steps: [], checks: 0, nextCheckAt: 0 }

  it('hands executeUpload an outer CAR whose single file is an FEE envelope of the inner CAR', async () => {
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    const { result } = renderHook(useFilecoinUpload)
    let publicCid = ''
    await act(async () => {
      publicCid = await result.current.uploadFile(testFile)
    })

    const [, outerBytes, outerRootArg] = executeUploadMock.mock.lastCall ?? []
    const { root, content: envelope } = await unpackSingleFile(outerBytes as Uint8Array)
    // The root argument is the outer CAR's own root, and it is not the plaintext root.
    expect(String(outerRootArg)).toBe(root.toString())
    expect(root.toString()).not.toBe(payloadRoot)
    // The packed file is a real FEE envelope that the session grant decrypts byte-exact.
    expect(await isEncryptionEnvelope(envelope)).toBe(true)
    const inner = await decryptEnvelope(envelope, grantKeyResolver(sessionPrivateKey, credential))
    const innerReader = await CarReader.fromBytes(inner)
    expect((await innerReader.getRoots())[0].toString()).toBe(payloadRoot)
    // Public identity everywhere is the outer root; the inner root rides as contentRootCid.
    expect(publicCid).toBe(root.toString())
    expect(result.current.uploadState.currentCid).toBe(root.toString())
    expect(result.current.uploadState.contentRootCid).toBe(payloadRoot)
    expect(result.current.uploadState.encrypted).toBe(true)
    // Funding is sized on the bytes actually uploaded, not the plaintext.
    expect(prepareMock).toHaveBeenCalledWith(
      expect.objectContaining({ pieceSizes: [BigInt((outerBytes as Uint8Array).length)] })
    )
  })

  it('produces a different outer root per upload of identical plaintext (fresh salt)', async () => {
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    const { result } = renderHook(useFilecoinUpload)
    let first = ''
    let second = ''
    await act(async () => {
      first = await result.current.uploadFile(testFile)
    })
    await act(async () => {
      second = await result.current.uploadFile(testFile)
    })
    expect(first).not.toBe(second)
  })

  it('blocks the upload before any funding or provider work when encryption is not ready', async () => {
    useFilecoinPinContextMock.mockReturnValue({ ...baseContext, encryption: { ready: false } })
    const { result } = renderHook(useFilecoinUpload)
    await act(async () => {
      await expect(result.current.uploadFile(testFile)).rejects.toThrow(
        'Add your encryption key in Wallet setup before uploading.'
      )
    })
    expect(prepareMock).not.toHaveBeenCalled()
    expect(createFreshUploadContextsMock).not.toHaveBeenCalled()
    expect(executeUploadMock).not.toHaveBeenCalled()
  })

  it('carries the foc/* data-set metadata on the fresh-context path', async () => {
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    const { result } = renderHook(useFilecoinUpload)
    await act(async () => {
      await result.current.uploadFile(testFile)
    })
    expect(createFreshUploadContextsMock).toHaveBeenCalledWith(
      baseContext.synapse,
      expect.any(String),
      2,
      [],
      encryptedDataSetMetadata(credential)
    )
  })

  it('carries the foc/* data-set metadata on the smart-select fallback', async () => {
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    createFreshUploadContextsMock.mockRejectedValueOnce(new Error('No reachable storage providers available'))
    const { result } = renderHook(useFilecoinUpload)
    await act(async () => {
      await result.current.uploadFile(testFile)
    })
    expect(getOpts()?.metadata).toEqual({
      clientId: expect.any(String),
      ...encryptedDataSetMetadata(credential),
    })
  })

  it('carries the foc/* data-set metadata on the debug providerId path', async () => {
    useFilecoinPinContextMock.mockReturnValue({ ...baseContext, debugParams: { providerId: 6n, dataSetId: null } })
    const { result } = renderHook(useFilecoinUpload)
    await act(async () => {
      await result.current.uploadFile(testFile)
    })
    expect(createContextsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining(encryptedDataSetMetadata(credential)),
      })
    )
  })

  it('keys the unfinished-work guard on the inner root, preferring contentRootCid over cid', async () => {
    const scope = '314159:0xabc'
    useFilecoinPinContextMock.mockReturnValue({ ...baseContext, storageScope: scope })
    const { result } = renderHook(useFilecoinUpload)
    // An encrypted record whose public cid differs but whose content root matches blocks the re-upload.
    setCachedPieces(scope, [
      {
        id: 'encrypted-in-flight',
        cid: 'bafyouterenvelope',
        contentRootCid: payloadRoot,
        upload: inFlightUpload,
      } as never,
    ])
    await act(async () => {
      await expect(result.current.uploadFile(testFile)).rejects.toThrow('unfinished deletion or upload')
    })
    expect(executeUploadMock).not.toHaveBeenCalled()
    // A record whose public cid equals the inner root but whose content root differs does not block.
    setCachedPieces(scope, [
      {
        id: 'other-content',
        cid: payloadRoot,
        contentRootCid: 'bafyothercontent',
        upload: inFlightUpload,
      } as never,
    ])
    await act(async () => {
      await result.current.uploadFile(testFile)
    })
    expect(executeUploadMock).toHaveBeenCalledOnce()
  })

  it('caches directory uploads under the outer root with the plaintext inner CAR', async () => {
    useFilecoinPinContextMock.mockReturnValue(baseContext)
    prepareUploadInputMock.mockResolvedValue({
      rootCid: baseCar.rootCid,
      carBytes: baseCar.carBytes,
      isDirectory: true,
    })
    const { result } = renderHook(useFilecoinUpload)
    await act(async () => {
      await result.current.uploadFile(testFile)
    })
    const outerRoot = String(executeUploadMock.mock.lastCall?.[2])
    expect(cacheDirectoryUploadMock).toHaveBeenCalledWith(baseCar.carBytes, outerRoot)
  })
})
