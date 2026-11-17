import type { Synapse } from '@filoz/synapse-sdk'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { DatasetPiece } from './use-dataset-pieces.ts'

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  encryption: { ready: false } as Record<string, unknown>,
  ownerSigner: vi.fn(async () => undefined),
}))
vi.mock('../lib/filecoin-pin/download.ts', async (original) => ({
  ...(await original<object>()),
  downloadFile: mocks.download,
}))
vi.mock('./use-filecoin-pin-context.ts', () => ({ useFilecoinPinContext: () => ({ encryption: mocks.encryption }) }))
vi.mock('../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({ ownerSigner: mocks.ownerSigner }),
}))

import { useDownloadQueue } from './use-download-queue.ts'

const synapse = {} as Synapse
const files = ['first', 'second', 'third'].map((id) => ({ id, fileName: `${id}.txt`, cid: 'root' }) as DatasetPiece)
let jobs: Map<string, { finish: () => void; fail: (cause: Error) => void; progress: (stage: string) => void }>
beforeEach(() => {
  mocks.download.mockReset()
  mocks.encryption = { ready: false }
  jobs = new Map()
  mocks.download.mockImplementation(
    (_synapse, file, _credentials, progress) =>
      new Promise<void>((finish, fail) => {
        jobs.set(file.id, { finish, fail, progress })
      })
  )
})

it('downloads sequentially, deduplicates rapid clicks and cancels only queued jobs', async () => {
  const { result } = renderHook(() => useDownloadQueue(synapse, '314:alice'))
  act(() => {
    for (const file of files) {
      result.current.enqueueDownload(file)
      result.current.enqueueDownload(file)
    }
  })
  expect(mocks.download).toHaveBeenCalledOnce()
  expect(result.current.download?.id).toBe('first')
  expect(result.current.queuedDownloads.map((file) => file.id)).toEqual(['second', 'third'])
  act(() => {
    result.current.cancelQueuedDownload('first')
    result.current.cancelQueuedDownload('second')
    jobs.get('first')?.progress('preparing')
  })
  expect(result.current.download?.stage).toBe('Preparing original file')
  expect(result.current.queuedDownloads.map((file) => file.id)).toEqual(['third'])
  await act(async () => jobs.get('first')?.finish())
  expect(mocks.download).toHaveBeenCalledTimes(2)
  expect(result.current.download?.id).toBe('third')
  await act(async () => jobs.get('third')?.finish())
  expect(result.current.download).toBeNull()
  expect(result.current.queuedDownloads).toEqual([])
})

it('retains a named failure and continues with the next queued download', async () => {
  const { result } = renderHook(() => useDownloadQueue(synapse, '314:alice'))
  act(() => {
    result.current.enqueueDownload(files[0])
    result.current.enqueueDownload(files[1])
  })
  await act(async () => jobs.get('first')?.fail(new Error('Provider unavailable')))
  expect(result.current.downloadError).toBe('first.txt: Provider unavailable')
  expect(result.current.download?.id).toBe('second')
  await act(async () => jobs.get('second')?.finish())
  expect(result.current.downloadError).toContain('first.txt')
  expect(result.current.download).toBeNull()
})

it('discards pending jobs on a scope change and ignores old completion and progress', async () => {
  const { result, rerender } = renderHook(({ scope }) => useDownloadQueue(synapse, scope), {
    initialProps: { scope: '314:alice' },
  })
  act(() => {
    result.current.enqueueDownload(files[0])
    result.current.enqueueDownload(files[1])
  })
  rerender({ scope: '314159:bob' })
  expect(result.current.download).toBeNull()
  expect(result.current.queuedDownloads).toEqual([])
  act(() => result.current.enqueueDownload(files[2]))
  await act(async () => {
    jobs.get('first')?.progress('preparing')
    jobs.get('first')?.finish()
  })
  expect(result.current.download?.id).toBe('third')
  expect(result.current.download?.stage).toBe('Downloading from storage provider')
  expect(mocks.download.mock.calls.map(([, file]) => file.id)).toEqual(['first', 'third'])
  await act(async () => jobs.get('third')?.finish())
})

it('never starts a queued download after unmount', async () => {
  const { result, unmount } = renderHook(() => useDownloadQueue(synapse, '314:alice'))
  act(() => {
    result.current.enqueueDownload(files[0])
    result.current.enqueueDownload(files[1])
  })
  unmount()
  await act(async () => jobs.get('first')?.finish())
  expect(mocks.download).toHaveBeenCalledOnce()
})

it('assembles decrypt credentials from the session context and surfaces the unlocking stage', async () => {
  const credential = { grant: 'grant', groupKeyId: '0xid', commitment: 'v1.c', owner: '0xabc' }
  mocks.encryption = { ready: true, sessionPrivateKey: '0x11', credential }
  const { result } = renderHook(() => useDownloadQueue(synapse, '314:alice'))
  act(() => result.current.enqueueDownload(files[0]))
  const credentials = mocks.download.mock.calls[0][2]
  expect(credentials.session).toEqual({ privateKey: '0x11', credential })
  expect(credentials.commitment).toBe('v1.c')
  // The wallet provider does not expose its EIP-712 signer yet; the owner
  // fallback stays typed but inactive, so decrypt errors name the owner wallet.
  expect(await credentials.ownerSigner()).toBeUndefined()
  act(() => jobs.get('first')?.progress('unlocking'))
  expect(result.current.download?.stage).toBe('Sign to unlock your files')
  await act(async () => jobs.get('first')?.finish())
})

it('passes no session credentials while encryption is not ready', async () => {
  const { result } = renderHook(() => useDownloadQueue(synapse, '314:alice'))
  act(() => result.current.enqueueDownload(files[0]))
  const credentials = mocks.download.mock.calls[0][2]
  expect(credentials.session).toBeUndefined()
  expect(credentials.commitment).toBeUndefined()
  await act(async () => jobs.get('first')?.finish())
})
