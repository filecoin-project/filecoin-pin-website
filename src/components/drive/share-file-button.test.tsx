import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

const mocks = vi.hoisted(() => ({
  encryption: { ready: false } as Record<string, unknown>,
  mint: vi.fn(),
  ownerSigner: vi.fn(async () => undefined),
  ipni: vi.fn(async () => true),
  storageScope: 'calibration:0xabc' as string | undefined,
}))
vi.mock('filecoin-pin/core/utils', () => ({ checkIpniIndexer: mocks.ipni }))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({ encryption: mocks.encryption, synapse: null, storageScope: mocks.storageScope }),
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
