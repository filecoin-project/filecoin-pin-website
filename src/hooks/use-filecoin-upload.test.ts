import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { executeUploadMock, checkUploadReadinessMock, createCarFromFileMock, useFilecoinPinContextMock } = vi.hoisted(
  () => ({
    executeUploadMock: vi.fn(),
    checkUploadReadinessMock: vi.fn(),
    createCarFromFileMock: vi.fn(),
    useFilecoinPinContextMock: vi.fn(),
  })
)

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

vi.mock('./use-ipni-check.ts', () => ({
  cacheIpniResult: vi.fn(),
}))

import { useFilecoinUpload } from './use-filecoin-upload.ts'

const baseContext = {
  synapse: {},
  wallet: { status: 'ready', data: { address: '0xabc' } },
  addDataSetId: vi.fn(),
  debugParams: { providerId: null, dataSetId: null },
}

const testFile = new File(['hello'], 'a.txt')

beforeEach(() => {
  vi.clearAllMocks()
  createCarFromFileMock.mockResolvedValue({
    rootCid: { toString: () => 'bafyrootcid' },
    carBytes: new Uint8Array([1, 2, 3]),
  })
  checkUploadReadinessMock.mockResolvedValue({ status: 'ready' })
  executeUploadMock.mockResolvedValue({ copies: [], network: 'calibration' })
})

describe('useFilecoinUpload providerId debug param', () => {
  const getOpts = () => executeUploadMock.mock.lastCall?.at(-1)

  it('forwards debugParams.providerId to executeUpload as providerIds=[BigInt(n)]', async () => {
    useFilecoinPinContextMock.mockReturnValue({
      ...baseContext,
      debugParams: { providerId: 6, dataSetId: null },
    })

    const { result } = renderHook(() => useFilecoinUpload())
    await result.current.uploadFile(testFile)

    expect(executeUploadMock).toHaveBeenCalledTimes(1)
    expect(getOpts()).toMatchObject({ providerIds: [BigInt(6)] })
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
