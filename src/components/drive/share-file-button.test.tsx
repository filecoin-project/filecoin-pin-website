import type { Synapse } from '@filoz/synapse-sdk'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { base64 } from 'multiformats/bases/base64'
import { afterEach, expect, it, vi } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import * as indexing from '../../hooks/use-ipfs-indexing.ts'

const mocks = vi.hoisted(() => ({
  encryption: { ready: false } as Record<string, unknown>,
  mint: vi.fn(),
  synapse: null as Synapse | null,
  ownerSigner: vi.fn(async () => undefined),
  ipni: vi.fn(async () => true),
  storageScope: 'calibration:0xabc' as string | undefined,
}))
vi.mock('filecoin-pin/core/utils', () => ({ checkIpniIndexer: mocks.ipni }))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    encryption: mocks.encryption,
    synapse: mocks.synapse,
    storageScope: mocks.storageScope,
  }),
}))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({ ownerSigner: mocks.ownerSigner }),
}))
vi.mock('../../lib/filecoin-pin/download.ts', async (original) => ({
  ...(await original<object>()),
  encryptedPieceShareLink: mocks.mint,
}))

import { ShareFileButton } from './share-file-button.tsx'

const file = {
  id: 'file',
  fileName: 'hello.txt',
  cid: 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe',
  pieceCid: 'piece',
  datasetId: '1',
  serviceURL: 'https://sp.example',
} as DatasetPiece
const clipboard = (writeText: ReturnType<typeof vi.fn>) => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  return () => {
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else Reflect.deleteProperty(navigator, 'clipboard')
  }
}
let restore: (() => void) | undefined
afterEach(() => {
  restore?.()
  restore = undefined
  mocks.synapse = null
  mocks.storageScope = 'calibration:0xabc'
})

it('opens without copying and copies the displayed link only when requested', async () => {
  const write = vi.fn().mockResolvedValue(undefined)
  restore = clipboard(write)
  render(<ShareFileButton file={file} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  const dialog = screen.getByRole('dialog', { name: 'Share file' })
  const link = screen.getByRole('textbox', { name: 'Share link' }) as HTMLInputElement
  expect(write).not.toHaveBeenCalled()
  expect(link.value).toContain('.ipfs.inbrowser.link/')
  expect(dialog.querySelector('svg title')?.textContent).toBe('Share link QR code')
  expect(dialog.querySelector('svg path')).toBeTruthy()
  expect(screen.queryByText('Copied!')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(screen.getByText('Copied!')).toBeTruthy())
  expect(write).toHaveBeenCalledOnce()
  expect(write).toHaveBeenCalledWith(link.value)
  fireEvent.click(screen.getByRole('button', { name: 'Close share' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(screen.queryByText('Copied!')).toBeNull()
  expect(write).toHaveBeenCalledOnce()
})

it('keeps the QR code and selectable link available when clipboard permission is denied', async () => {
  const write = vi.fn().mockRejectedValue(new Error('Permission denied'))
  restore = clipboard(write)
  render(<ShareFileButton file={{ ...file, importedCar: true }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveProperty('value', 'https://sp.example/piece/piece')
  await screen.findByText('Scan to download the original CAR archive from its storage provider.')
  expect(write).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(write).toHaveBeenCalledOnce())
  expect(screen.getByRole('textbox', { name: 'Share link' })).toBeTruthy()
  expect(screen.getByText('Copy the link, or scan the QR code.')).toBeTruthy()
  expect(screen.queryByText('Link copied.')).toBeNull()
})

it('mints a keysmith link for an encrypted file when opened, and only then', async () => {
  mocks.encryption = {
    ready: true,
    sessionPrivateKey: `0x${'1'.repeat(64)}`,
    credential: { grant: 'mAA', groupKeyId: `0x${'a'.repeat(32)}`, commitment: 'v1.b', owner: '0xabc' },
  }
  let resolve!: (link: string) => void
  mocks.mint.mockImplementation(() => new Promise<string>((r) => (resolve = r)))
  const encrypted = { ...file, encrypted: true } as DatasetPiece
  render(<ShareFileButton file={encrypted} />)
  expect(mocks.mint).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  // Minting: no link yet, spinner copy shown instead of a gateway URL.
  expect(mocks.mint).toHaveBeenCalledOnce()
  expect(screen.queryByRole('textbox', { name: 'Share link' })).toBeNull()
  resolve('https://viewer.example/#v1/bafy&d=payload&k=fak1_secret')
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveProperty(
      'value',
      'https://viewer.example/#v1/bafy&d=payload&k=fak1_secret'
    )
  )
  // Reopening reuses the minted link: wrapping is not free and every mint
  // would otherwise refetch the stored piece.
  fireEvent.click(screen.getByRole('button', { name: 'Close share' }))
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(mocks.mint).toHaveBeenCalledOnce()
})

it('shares an encrypted file without a grant: minting falls back to the owner wallet', async () => {
  mocks.encryption = { ready: false }
  mocks.mint.mockResolvedValue('https://viewer.example/#v1/bafy&d=p&k=fak1_s')
  render(<ShareFileButton file={{ ...file, id: 'no-grant', encrypted: true } as DatasetPiece} />)
  const button = screen.getByRole('button', { name: 'Share' })
  expect(button).toHaveProperty('disabled', false)
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Share link' })).toBeTruthy())
  // No session credentials passed; the helper gets only the owner signer.
  const credentials = mocks.mint.mock.lastCall?.[2] as Record<string, unknown>
  expect(credentials.session).toBeUndefined()
  expect(credentials.ownerSigner).toBe(mocks.ownerSigner)
})

it('warns about indexing only on a confirmed live IPNI miss, not a stale local flag', async () => {
  mocks.encryption = { ready: false }
  mocks.mint.mockResolvedValue('https://viewer.example/#v1/bafy&d=p&k=fak1_s')
  const encrypted = {
    ...file,
    id: 'stale-flag',
    cid: 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe',
    encrypted: true,
    ipfsIndexed: false, // stale: the background checker gave up before IPNI caught up
  } as DatasetPiece
  // Live check says indexed: no warning despite the stale flag.
  mocks.ipni.mockResolvedValueOnce(true)
  const { unmount } = render(<ShareFileButton file={encrypted} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Share link' })).toBeTruthy())
  expect(screen.queryByText(/IPFS index/)).toBeNull()
  unmount()
  // Live check misses: the warning shows.
  mocks.ipni.mockResolvedValueOnce(false)
  render(<ShareFileButton file={{ ...encrypted, id: 'really-missing' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(screen.getByText(/IPFS index/)).toBeTruthy())
})

it('budgets the live IPNI check so remounting the dialog does not repeat the direct lookup', async () => {
  mocks.encryption = { ready: false }
  mocks.mint.mockResolvedValue('https://viewer.example/#v1/bafy&d=p&k=fak1_s')
  mocks.ipni.mockClear()
  mocks.ipni.mockResolvedValueOnce(false)
  const encrypted = { ...file, id: 'budgeted', encrypted: true, ipfsIndexed: false } as DatasetPiece
  const first = render(<ShareFileButton file={encrypted} />)
  fireEvent.click(first.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(first.getByText(/IPFS index/)).toBeTruthy())
  expect(mocks.ipni).toHaveBeenCalledOnce()
  first.unmount()
  // A fresh mount of the same file (e.g. reselecting it, or a row re-render)
  // must reuse the budget already reserved for this CID, not fire again.
  const second = render(<ShareFileButton file={encrypted} />)
  fireEvent.click(second.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(second.getByText(/IPFS index/)).toBeTruthy())
  expect(mocks.ipni).toHaveBeenCalledOnce()
})

it('skips the live IPNI check entirely without a storage scope to budget against', async () => {
  mocks.encryption = { ready: false }
  mocks.mint.mockResolvedValue('https://viewer.example/#v1/bafy&d=p&k=fak1_s')
  mocks.ipni.mockClear()
  mocks.storageScope = undefined
  const encrypted = { ...file, id: 'no-scope', encrypted: true, ipfsIndexed: false } as DatasetPiece
  render(<ShareFileButton file={encrypted} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Share link' })).toBeTruthy())
  expect(mocks.ipni).not.toHaveBeenCalled()
  expect(screen.queryByText(/IPFS index/)).toBeNull()
  mocks.storageScope = 'calibration:0xabc'
})

it('falls back to the public gateway link when the stored piece is not an encrypted envelope', async () => {
  mocks.encryption = { ready: false }
  // A data set flagged foc/enc marks every piece encrypted, but early uploads
  // in it are plain: minting refuses, and the dialog degrades to the public link.
  mocks.mint.mockRejectedValue(new Error('This record is not an encrypted upload; share its public link instead.'))
  render(<ShareFileButton file={{ ...file, id: 'mis-flagged', encrypted: true } as DatasetPiece} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveProperty(
      'value',
      expect.stringContaining('.ipfs.inbrowser.link/')
    )
  )
  // Public copy, not the encrypted-share warning, and no error message.
  expect(screen.getByText('Scan to open this file. Your browser may display or download it.')).toBeTruthy()
  expect(screen.queryByText(/not an encrypted upload/)).toBeNull()
  expect(screen.queryByText(/cannot be revoked/)).toBeNull()
})

it('still reports mint failures that are not the plain-piece case', async () => {
  mocks.encryption = { ready: false }
  mocks.mint.mockRejectedValue(new Error('Unable to download the file from its storage providers. Try again later.'))
  render(<ShareFileButton file={{ ...file, id: 'real-error', encrypted: true } as DatasetPiece} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(screen.getByText(/Unable to download the file/)).toBeTruthy())
  expect(screen.queryByRole('textbox', { name: 'Share link' })).toBeNull()
})

it('warns about whole-upload access before a nested file share link is ready', async () => {
  mocks.encryption = { ready: false }
  mocks.mint.mockImplementation(
    () =>
      new Promise<string>(() => {
        // Keep minting pending to verify the warning appears before the link.
      })
  )
  render(
    <ShareFileButton
      file={
        {
          ...file,
          id: 'nested-share',
          encrypted: true,
          directoryEntry: { rootCid: file.cid, path: 'docs/hello.txt' },
        } as DatasetPiece
      }
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(screen.getByRole('dialog', { name: 'Share folder' })).toBeTruthy()
  expect(screen.getByRole('note').textContent).toContain('This link shares the entire uploaded folder.')
  expect(screen.getByRole('note').textContent).toContain('Access cannot be revoked.')
  expect(screen.queryByRole('textbox', { name: 'Share link' })).toBeNull()
})

it('shows cancellation without an error alert and retries only on request', async () => {
  mocks.encryption = { ready: false }
  mocks.mint
    .mockReset()
    .mockRejectedValueOnce(Object.assign(new Error('Rejected'), { code: 4001 }))
    .mockResolvedValueOnce('https://viewer.example/#test')
  render(<ShareFileButton file={{ ...file, id: 'cancelled-share', encrypted: true } as DatasetPiece} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() =>
    expect(screen.getByText('Sharing cancelled. Sign with your wallet to create a share link.')).toBeTruthy()
  )
  expect(screen.queryByRole('alert')).toBeNull()
  expect(mocks.mint).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Share link' })).toBeTruthy())
  expect(mocks.mint).toHaveBeenCalledTimes(2)
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

it('closing during retrieval prevents the real share helper from requesting the owner signer', async () => {
  const actual = await vi.importActual<typeof import('../../lib/filecoin-pin/download.ts')>(
    '../../lib/filecoin-pin/download.ts'
  )
  // A real FEE envelope packed as a single raw-block CAR (key is 32 bytes of 1).
  const carBytes = base64.baseDecode(
    'OqJlcm9vdHOB2CpYJQABVRIgSmOdeP8SMrNoLyJIGA28Rg6a10jVrRI80/tPMnHzcqBndmVyc2lvbgGHAQFVEiBKY514/xIys2gvIkgYDbxGDprXSNWtEjzT+08ycfNyoNCDWEelAToAAQEABUc9/FI+rw6rEHgoYXBwbGljYXRpb24vdm5kLmZpbGVjb2luLWVuY3J5cHRpb24rY29zZSAaAAQAADoAAQD8BqD2LV8WwcCNUUDPo5gp00tT2XSFL/7wEg=='
  )
  const retrieval = deferred<Uint8Array>()
  const download = vi.fn(() => retrieval.promise)
  mocks.synapse = { storage: { createContext: async () => ({ download }) } } as unknown as Synapse
  mocks.encryption = { ready: false }
  mocks.ownerSigner.mockClear()
  mocks.mint.mockReset().mockImplementation(actual.encryptedPieceShareLink)
  render(
    <ShareFileButton
      file={{
        ...file,
        cid: 'bafkreickmooxr7ysgkzwqlzcjama3pcgb2nnosgvvujdzu73j4zhd43sua',
        encrypted: true,
        ipfsIndexed: true,
      }}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(download).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Close share' }))
  const result = mocks.mint.mock.results[0].value as Promise<string>
  await act(async () => {
    retrieval.resolve(carBytes)
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })
  expect(mocks.ownerSigner).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it.each(['link', 'error', 'public fallback'] as const)(
  'ignores a stale %s after closing and reopening while minting',
  async (completion) => {
    const old = deferred<string>()
    const fresh = deferred<string>()
    mocks.encryption = { ready: false }
    mocks.mint.mockReset().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    render(<ShareFileButton file={{ ...file, encrypted: true, ipfsIndexed: true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const signal = mocks.mint.mock.calls[0][3] as AbortSignal
    fireEvent.click(screen.getByRole('button', { name: 'Close share' }))
    expect(signal.aborted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect((mocks.mint.mock.calls[1][3] as AbortSignal).aborted).toBe(false)
    if (completion === 'link') await act(async () => fresh.resolve('https://viewer.example/#fresh'))
    await act(async () => {
      if (completion === 'link') old.resolve('https://viewer.example/#old')
      else old.reject(new Error(completion === 'error' ? 'Old failure' : 'Not an encrypted upload'))
    })
    if (completion !== 'link') {
      expect(screen.queryByRole('textbox')).toBeNull()
      await act(async () => fresh.resolve('https://viewer.example/#fresh'))
    }
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'https://viewer.example/#fresh')
  }
)

it.each(['unmount', 'scope', 'root'] as const)('invalidates pending sharing on %s', async (change) => {
  const pending = deferred<string>()
  mocks.mint.mockReset().mockReturnValueOnce(pending.promise).mockResolvedValue('https://viewer.example/#fresh')
  const encrypted = { ...file, encrypted: true, ipfsIndexed: true }
  const view = render(<ShareFileButton file={encrypted} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  const signal = mocks.mint.mock.calls[0][3] as AbortSignal
  if (change === 'unmount') view.unmount()
  else {
    if (change === 'scope') mocks.storageScope = 'mainnet:0xother'
    view.rerender(
      <ShareFileButton
        file={
          change === 'root'
            ? { ...encrypted, cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku' }
            : encrypted
        }
      />
    )
  }
  expect(signal.aborted).toBe(true)
  await act(async () => pending.resolve('https://viewer.example/#old'))
  expect(screen.queryByRole('dialog')).toBeNull()
  if (change !== 'unmount') {
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveProperty('value', 'https://viewer.example/#fresh'))
  }
})

it('discards cached links when switching scope and switching back', async () => {
  mocks.mint
    .mockReset()
    .mockResolvedValueOnce('https://viewer.example/#old')
    .mockReturnValue(deferred<string>().promise)
  const encrypted = { ...file, encrypted: true, ipfsIndexed: true }
  const view = render(<ShareFileButton file={encrypted} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await screen.findByRole('textbox')
  mocks.storageScope = 'mainnet:0xother'
  view.rerender(<ShareFileButton file={encrypted} />)
  mocks.storageScope = 'calibration:0xabc'
  view.rerender(<ShareFileButton file={encrypted} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(mocks.mint).toHaveBeenCalledTimes(2)
})

it.each(['reservation', 'lookup', 'reset'] as const)(
  'keeps sharing usable and reports an indexing %s failure',
  async (failure) => {
    mocks.mint.mockReset().mockResolvedValue('https://viewer.example/#test')
    mocks.ipni.mockReset().mockResolvedValue(true)
    const reserve = vi.spyOn(indexing, 'reserveIndexingCheck').mockResolvedValue({ attempts: 1, nextAt: 0 })
    const reset = vi.spyOn(indexing, 'resetIndexingChecks').mockResolvedValue(undefined)
    if (failure === 'reservation') reserve.mockRejectedValueOnce(new Error('Storage unavailable'))
    if (failure === 'lookup') mocks.ipni.mockRejectedValueOnce(new Error('Network unavailable'))
    if (failure === 'reset') reset.mockRejectedValueOnce(new Error('Storage unavailable'))
    render(<ShareFileButton file={{ ...file, encrypted: true, ipfsIndexed: false }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await screen.findByText(/Availability couldn’t be checked/)
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'https://viewer.example/#test')
    fireEvent.click(screen.getByRole('button', { name: 'Close share' }))
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(screen.queryByText(/Availability couldn’t be checked/)).toBeNull())
    expect(mocks.mint).toHaveBeenCalledOnce()
  }
)
