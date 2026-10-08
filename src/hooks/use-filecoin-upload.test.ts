import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  executeUploadMock,
  checkUploadReadinessMock,
  createCarFromFileMock,
  useFilecoinPinContextMock,
  createFreshUploadContextsMock,
  createContextsMock,
  prepareMock,
} = vi.hoisted(() => ({
  executeUploadMock: vi.fn(),
  checkUploadReadinessMock: vi.fn(),
  createCarFromFileMock: vi.fn(),
  useFilecoinPinContextMock: vi.fn(),
  createFreshUploadContextsMock: vi.fn(),
  createContextsMock: vi.fn(),
  prepareMock: vi.fn(),
}))

vi.mock('../lib/filecoin-pin/storage-chain.ts', () => ({ assertCurrentStorageChain: vi.fn() }))

vi.mock('filecoin-pin/core/upload', () => ({
  executeUpload: executeUploadMock,
  checkUploadReadiness: checkUploadReadinessMock,
}))

vi.mock('filecoin-pin/core/unixfs', () => ({
  createCarFromFile: createCarFromFileMock,
}))

vi.mock('./use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: useFilecoinPinContextMock,
}))

vi.mock('../lib/filecoin-pin/synapse.ts', () => ({
  APPLICATION_SOURCE: 'filecoin-pin',
  ensureSessionKeyPermissions: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/filecoin-pin/fresh-contexts.ts', () => ({
  createFreshUploadContexts: createFreshUploadContextsMock,
}))

import { CommitError, StoreError } from '@filoz/synapse-sdk'
import { addStoredDataSetId, getStoredDataSetIds } from '../lib/local-storage/data-set.ts'
import { getCachedPieces, setCachedPieces } from '../lib/local-storage/piece-cache.ts'
import { useFilecoinUpload } from './use-filecoin-upload.ts'

const baseContext = {
  synapse: { storage: { createContexts: createContextsMock, prepare: prepareMock } },
  wallet: { status: 'ready', data: { address: '0xabc' } },
  addDataSetId: vi.fn(),
  debugParams: { providerId: null, dataSetId: null },
}

const testFile = new File(['hello'], 'a.txt')

const fakeContexts = [{ provider: { id: 4n, name: 'provider-a' } }, { provider: { id: 2n, name: 'provider-b' } }]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  createCarFromFileMock.mockResolvedValue({
    rootCid: { toString: () => 'bafyrootcid' },
    carBytes: new Uint8Array([1, 2, 3]),
  })
  checkUploadReadinessMock.mockResolvedValue({ status: 'ready' })
  executeUploadMock.mockResolvedValue({ copies: [], network: 'calibration' })
  createFreshUploadContextsMock.mockResolvedValue(fakeContexts)
  createContextsMock.mockResolvedValue(fakeContexts)
  prepareMock.mockResolvedValue({ costs: { ready: true } })
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
      'error'
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
    expect(createContextsMock).toHaveBeenCalledWith({ withCDN: false, dataSetIds: [42n, 77n] })
    expect(getOpts()).toMatchObject({ contexts: fakeContexts })
    expect(getOpts()).not.toHaveProperty('dataSetIds')
    expect(getOpts()).not.toHaveProperty('metadata')
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
