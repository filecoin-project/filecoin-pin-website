import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { DatasetPiece } from './use-dataset-pieces.ts'

const mocks = vi.hoisted(() => ({
  scope: '314:owner',
  synapse: {} as object | null,
  encryption: { ready: false },
  ownerSigner: vi.fn(),
  mint: vi.fn(),
  toast: vi.fn(),
  neutral: vi.fn(),
}))
vi.mock('../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({ ownerSigner: mocks.ownerSigner }),
}))
vi.mock('./use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({ synapse: mocks.synapse, encryption: mocks.encryption, storageScope: mocks.scope }),
}))
vi.mock('../lib/filecoin-pin/download.ts', () => ({
  decryptCredentials: (_state: unknown, ownerSigner: unknown) => ({ ownerSigner }),
  encryptedPieceShareLink: mocks.mint,
}))
vi.mock('../utils/toast.tsx', () => ({ toast: { error: mocks.toast, neutral: mocks.neutral } }))

import { useEncryptedPreview } from './use-encrypted-preview.ts'

const file = { id: 'html', cid: 'outer', fileName: 'page.html', encrypted: true, pieceCid: 'piece' } as DatasetPiece
const viewerUrl = 'https://viewer.example/#v1/outer&d=grant&k=fak1_key'
beforeEach(() => {
  mocks.scope = '314:owner'
  mocks.synapse = {}
  mocks.mint.mockReset()
  mocks.toast.mockReset()
  mocks.neutral.mockReset()
  vi.spyOn(window, 'open').mockReturnValue(null)
})

function deferred() {
  let resolve: (value: string) => void = () => {
    throw new Error('Not initialized')
  }
  const promise = new Promise<string>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

it('prepares an HTML viewer link without opening a blank page or navigating automatically', async () => {
  const pending = deferred()
  mocks.mint.mockReturnValue(pending.promise)
  const { result } = renderHook(() => useEncryptedPreview())
  act(() => result.current.preparePreview(file))
  expect(result.current.previewingId).toBe(file.id)
  expect(result.current.getPreviewLink(file)).toBeUndefined()
  expect(window.open).not.toHaveBeenCalled()
  await act(async () => pending.resolve(viewerUrl))
  expect(result.current.getPreviewLink(file)).toBe(viewerUrl)
  expect(mocks.mint).toHaveBeenCalledWith(
    mocks.synapse,
    file,
    { ownerSigner: mocks.ownerSigner },
    expect.any(AbortSignal)
  )
  expect(result.current.previewingId).toBeNull()
  expect(window.open).not.toHaveBeenCalled()
})

it('blocks duplicate requests while preparing and reuses the prepared link', async () => {
  const pending = deferred()
  mocks.mint.mockReturnValue(pending.promise)
  const { result } = renderHook(() => useEncryptedPreview())
  act(() => {
    result.current.preparePreview(file)
    result.current.preparePreview(file)
  })
  expect(mocks.mint).toHaveBeenCalledOnce()
  await act(async () => pending.resolve(viewerUrl))
  act(() => result.current.preparePreview(file))
  expect(mocks.mint).toHaveBeenCalledOnce()
  expect(result.current.getPreviewLink(file)).toBe(viewerUrl)
})

it('does not expose a prepared link for another record or upload root', async () => {
  mocks.mint.mockResolvedValue(viewerUrl)
  const { result } = renderHook(() => useEncryptedPreview())
  act(() => result.current.preparePreview(file))
  await waitFor(() => expect(result.current.getPreviewLink(file)).toBe(viewerUrl))
  expect(result.current.getPreviewLink({ ...file, id: 'another' })).toBeUndefined()
  expect(result.current.getPreviewLink({ ...file, cid: 'another-root' })).toBeUndefined()
})

it('shows the error and allows retry after a rejected signature', async () => {
  mocks.mint.mockRejectedValueOnce(new Error('User rejected signature.')).mockResolvedValueOnce(viewerUrl)
  const { result } = renderHook(() => useEncryptedPreview())
  act(() => result.current.preparePreview(file))
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('User rejected signature.'))
  expect(result.current.previewingId).toBeNull()
  expect(result.current.getPreviewLink(file)).toBeUndefined()
  act(() => result.current.preparePreview(file))
  await waitFor(() => expect(result.current.getPreviewLink(file)).toBe(viewerUrl))
  expect(window.open).not.toHaveBeenCalled()
})

it.each(['unmount', 'wallet'] as const)(
  'cancels pending authorization on %s and ignores late links',
  async (change) => {
    const pending = deferred()
    mocks.mint.mockReturnValue(pending.promise)
    const view = renderHook(() => useEncryptedPreview())
    act(() => view.result.current.preparePreview(file))
    const signal = mocks.mint.mock.calls[0][3] as AbortSignal
    if (change === 'unmount') view.unmount()
    else {
      mocks.scope = '314:other'
      view.rerender()
    }
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(viewerUrl))
    if (change === 'wallet') expect(view.result.current.getPreviewLink(file)).toBeUndefined()
    expect(window.open).not.toHaveBeenCalled()
    expect(mocks.toast).not.toHaveBeenCalled()
  }
)

it('clears prepared links when switching wallets, including switching back', async () => {
  mocks.mint.mockResolvedValue(viewerUrl)
  const view = renderHook(() => useEncryptedPreview())
  act(() => view.result.current.preparePreview(file))
  await waitFor(() => expect(view.result.current.getPreviewLink(file)).toBe(viewerUrl))
  mocks.scope = '314:other'
  view.rerender()
  expect(view.result.current.getPreviewLink(file)).toBeUndefined()
  mocks.scope = '314:owner'
  view.rerender()
  expect(view.result.current.getPreviewLink(file)).toBeUndefined()
})

it('treats wallet cancellation as neutral and permits another attempt', async () => {
  mocks.mint
    .mockRejectedValueOnce(new Error('RPC rejected', { cause: Object.assign(new Error('Rejected'), { code: 4001 }) }))
    .mockResolvedValueOnce(viewerUrl)
  const { result } = renderHook(() => useEncryptedPreview())
  act(() => result.current.preparePreview(file))
  await waitFor(() =>
    expect(mocks.neutral).toHaveBeenCalledWith('Preview cancelled. Sign with your wallet to open this upload.')
  )
  expect(mocks.toast).not.toHaveBeenCalled()
  expect(result.current.previewingId).toBeNull()
  act(() => result.current.preparePreview(file))
  await waitFor(() => expect(result.current.getPreviewLink(file)).toBe(viewerUrl))
})

it('explains an unavailable wallet client and permits an explicit retry once it is ready', async () => {
  mocks.synapse = null
  mocks.mint.mockResolvedValue(viewerUrl)
  const { result, rerender } = renderHook(() => useEncryptedPreview())
  act(() => result.current.preparePreview(file))
  expect(mocks.toast).toHaveBeenCalledWith('Preview is not ready. Check your wallet connection and try again.')
  expect(result.current.previewingId).toBeNull()
  expect(mocks.mint).not.toHaveBeenCalled()
  mocks.synapse = {}
  rerender()
  expect(mocks.mint).not.toHaveBeenCalled()
  act(() => result.current.preparePreview(file))
  await waitFor(() => expect(result.current.getPreviewLink(file)).toBe(viewerUrl))
})
