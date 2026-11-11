import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

const mocks = vi.hoisted(() => ({
  scope: '314:owner',
  ownerSigner: vi.fn(async () => undefined),
  readers: [] as { signal: AbortSignal; owner: boolean; entry: ReturnType<typeof vi.fn> }[],
  unlock: vi.fn<() => Promise<unknown>>(),
}))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({ ownerSigner: mocks.ownerSigner }),
}))
const encryption = { ready: false }
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({ encryption, storageScope: mocks.scope }),
}))
vi.mock('../../hooks/use-encrypted-preview.ts', () => ({
  useEncryptedPreview: () => ({ preparePreview: vi.fn(), previewingId: null, getPreviewLink: () => undefined }),
}))
vi.mock('./share-file-button.tsx', () => ({ ShareFileButton: () => null }))
vi.mock('../../lib/filecoin-pin/download.ts', () => ({
  decryptCredentials: (_encryption: unknown, ownerSigner?: unknown) => ({ ownerSigner }),
}))
vi.mock('../../lib/filecoin-pin/ipfs-content.ts', () => ({
  contentReader: (_file: unknown, signal: AbortSignal, _rootOnly: boolean, credentials: { ownerSigner?: unknown }) => {
    const owner = Boolean(credentials.ownerSigner)
    const entry = vi.fn(async () => {
      if (!owner) throw new Error('Encryption access required.')
      const result = await mocks.unlock()
      signal.throwIfAborted()
      return result
    })
    const reader = { signal, owner, entry }
    mocks.readers.push(reader)
    return reader
  },
}))
vi.mock('../../lib/filecoin-pin/directory.ts', () => ({
  DIRECTORY_PAGE_SIZE: 100,
  listDirectory: async (reader: { owner: boolean; entry: () => Promise<unknown> }) => {
    if (!reader.owner) await reader.entry()
    return { items: [], hasMore: false, cid: 'inner' }
  },
  searchDirectory: vi.fn(),
}))

import { DirectoryBrowser } from './directory-browser.tsx'

const file = {
  id: 'folder',
  cid: 'outer',
  fileName: 'reports',
  pieceCid: 'piece',
  encrypted: true,
  isDirectory: true,
} as DatasetPiece
const props = {
  file,
  sort: { key: 'name', direction: 'asc' } as const,
  toggleSort: vi.fn(),
  search: '',
  onSearchChange: vi.fn(),
  onFolderChange: vi.fn(),
  onDownload: vi.fn(),
  downloadBlocked: () => false,
  isQueued: () => false,
}

beforeEach(() => {
  mocks.scope = '314:owner'
  mocks.readers.length = 0
  mocks.unlock.mockReset()
  mocks.ownerSigner.mockClear()
})

function deferred() {
  let resolve: (value: unknown) => void = () => {
    throw new Error('Not initialized')
  }
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

it('only starts one explicit unlock and keeps both action buttons disabled until it completes', async () => {
  const pending = deferred()
  mocks.unlock.mockReturnValue(pending.promise)
  render(<DirectoryBrowser {...props} />)
  await screen.findByText('Encryption access required.')
  expect(mocks.readers.some((reader) => reader.owner)).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Unlock folder' }))
  expect(screen.getByRole('button', { name: 'Unlocking…' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Retry loading folder' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Unlocking…' }))
  expect(mocks.unlock).toHaveBeenCalledOnce()
  await act(async () => pending.resolve({}))
  await waitFor(() => expect(screen.queryByText('Encryption access required.')).toBeNull())
  expect(mocks.readers.filter((reader) => reader.owner)).toHaveLength(1)
})

it.each(['unmount', 'wallet', 'file'] as const)(
  'aborts a pending unlock on %s and ignores its late result',
  async (change) => {
    const pending = deferred()
    mocks.unlock.mockReturnValue(pending.promise)
    const view = render(<DirectoryBrowser {...props} />)
    await screen.findByText('Encryption access required.')
    fireEvent.click(screen.getByRole('button', { name: 'Unlock folder' }))
    const task = mocks.readers.find((reader) => reader.owner)
    expect(task).toBeDefined()
    if (change === 'unmount') view.unmount()
    else if (change === 'wallet') {
      mocks.scope = '314:another-owner'
      view.rerender(<DirectoryBrowser {...props} />)
    } else view.rerender(<DirectoryBrowser {...props} file={{ ...file, cid: 'another-outer' }} />)
    expect(task?.signal.aborted).toBe(true)
    await act(async () => pending.resolve({}))
    if (change !== 'unmount') {
      await screen.findByText('Encryption access required.')
      expect(screen.getByRole('button', { name: 'Unlock folder' }).hasAttribute('disabled')).toBe(false)
    }
  }
)

it('allows a fresh explicit attempt after a rejected unlock without retrying automatically', async () => {
  mocks.unlock.mockRejectedValueOnce(new Error('User rejected signature.')).mockResolvedValueOnce({})
  render(<DirectoryBrowser {...props} />)
  await screen.findByText('Encryption access required.')
  fireEvent.click(screen.getByRole('button', { name: 'Unlock folder' }))
  await screen.findByText('User rejected signature.')
  expect(mocks.unlock).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Unlock folder' }))
  await waitFor(() => expect(screen.queryByText('User rejected signature.')).toBeNull())
  expect(mocks.unlock).toHaveBeenCalledTimes(2)
})
