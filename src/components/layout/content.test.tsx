import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import Content from './content.tsx'

const state = vi.hoisted(() => ({
  sessionStatus: 'none',
  walletStatus: 'idle',
  storageStatus: 'checking',
  encryptionReady: true,
  fundsStatus: 'available',
  busy: false,
  pending: null as { kind: 'deposit' } | null,
  refreshWallet: vi.fn(),
}))
beforeEach(() => {
  Object.assign(state, {
    sessionStatus: 'none',
    walletStatus: 'idle',
    storageStatus: 'checking',
    encryptionReady: true,
    fundsStatus: 'available',
    busy: false,
    pending: null,
  })
  state.refreshWallet.mockClear()
})
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({
    sessionStatus: state.sessionStatus,
    network: 'mainnet',
    busy: state.busy,
    pendingTransaction: state.pending,
    setUploading: vi.fn(),
  }),
}))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    wallet: { status: state.walletStatus },
    synapse: {},
    encryption: { ready: state.encryptionReady },
    storageSetup: {
      status: state.storageStatus,
      gasReady: true,
      depositReady: state.fundsStatus === 'available',
      approvalReady: true,
      fundsStatus: state.fundsStatus,
    },
    refreshWallet: state.refreshWallet,
  }),
}))
vi.mock('../../context/upload-tasks-context.tsx', () => ({ useUploadTasks: () => ({ transferring: false }) }))
vi.mock('../drive/file-browser.tsx', () => ({
  FileBrowser: ({ uploadDisabled, onUpload }: { uploadDisabled: boolean; onUpload: (folder: string) => void }) => (
    <button disabled={uploadDisabled} onClick={() => onUpload('')} type="button">
      Upload files
    </button>
  ),
}))

it.each(['file', 'folder'] as const)('preserves selected %s bytes across a failed balance refresh', (kind) => {
  Object.assign(state, {
    sessionStatus: 'active',
    walletStatus: 'ready',
    storageStatus: 'ready',
    encryptionReady: true,
    fundsStatus: 'available',
    busy: false,
    pending: null,
  })
  const view = render(<Content />)
  fireEvent.click(screen.getByRole('button', { name: 'Upload files' }))
  const file = new File(['keep these bytes'], 'keep-this.txt')
  const selectedName = kind === 'folder' ? 'keep-folder' : file.name
  if (kind === 'folder') {
    fireEvent.click(screen.getByRole('button', { name: 'Folder' }))
    Object.defineProperty(file, 'webkitRelativePath', { value: 'keep-folder/keep-this.txt' })
  }
  const input = view.container.ownerDocument.querySelector('input[type="file"]')
  if (!input) throw new Error('Missing file picker')
  fireEvent.change(input, { target: { files: [file] } })
  expect(screen.getByText(selectedName)).toBeTruthy()
  state.walletStatus = 'error'
  state.storageStatus = 'error'
  view.rerender(<Content />)
  expect(screen.getByText('Complete wallet setup before uploading.')).toBeTruthy()
  state.walletStatus = 'ready'
  state.storageStatus = 'ready'
  view.rerender(<Content />)
  expect(screen.getByText(selectedName)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close Upload files' }))
  fireEvent.click(screen.getByRole('button', { name: 'Upload files' }))
  expect(screen.queryByText(selectedName)).toBeNull()
})
vi.mock('../drive/wallet-controls.tsx', () => ({
  WalletSetup: ({ setupRequest }: { setupRequest?: { target: string } }) => <span>Target: {setupRequest?.target}</span>,
}))

it('waits for restored session and storage reads before prompting for setup', () => {
  const { rerender } = render(<Content />)
  expect(screen.queryByText('Set up wallet')).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('Checking wallet setup…')
  expect((screen.getByRole('button', { name: 'Upload files' }) as HTMLButtonElement).disabled).toBe(true)
  state.sessionStatus = 'active'
  state.walletStatus = 'ready'
  state.storageStatus = 'ready'
  rerender(<Content />)
  expect(screen.queryByText('Set up wallet')).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('Session ready')
  expect((screen.getByRole('button', { name: 'Upload files' }) as HTMLButtonElement).disabled).toBe(false)
  state.storageStatus = 'checking'
  rerender(<Content />)
  expect(screen.queryByText('Set up wallet')).toBeNull()
  state.storageStatus = 'blocked'
  rerender(<Content />)
  expect(screen.getByText('Set up wallet')).toBeTruthy()
})

it('blocks upload until the encryption key is ready and updates without reloading', () => {
  Object.assign(state, {
    sessionStatus: 'active',
    walletStatus: 'ready',
    storageStatus: 'ready',
    encryptionReady: false,
  })
  const view = render(<Content />)
  expect(screen.getByText('Add your encryption key to upload.')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Upload files' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByText('Choose files')).toBeNull()
  state.encryptionReady = true
  view.rerender(<Content />)
  expect((screen.getByRole('button', { name: 'Upload files' }) as HTMLButtonElement).disabled).toBe(false)
  expect(screen.queryByText('Add your encryption key to upload.')).toBeNull()
})

it('routes a repair request to the requested settings section', () => {
  Object.assign(state, {
    sessionStatus: 'active',
    walletStatus: 'ready',
    storageStatus: 'ready',
    encryptionReady: true,
  })
  render(<Content />)
  fireEvent(window, new CustomEvent('drive-open-wallet', { detail: { target: 'encryption' } }))
  expect(screen.getByText('Target: encryption')).toBeTruthy()
  fireEvent(window, new CustomEvent('drive-open-wallet', { detail: { target: 'gas' } }))
  expect(screen.getByText('Target: gas')).toBeTruthy()
})

it('retries failed configuration reads instead of navigating to a funding step', () => {
  Object.assign(state, {
    sessionStatus: 'active',
    walletStatus: 'error',
    storageStatus: 'error',
    encryptionReady: true,
  })
  state.refreshWallet.mockClear()
  render(<Content />)
  expect(screen.getByText('Unable to check wallet setup. Retry the checks to continue.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Add FIL' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry checks' }))
  expect(state.refreshWallet).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('blocks low-runway uploads at the wallet button before submitting files', () => {
  Object.assign(state, {
    sessionStatus: 'active',
    walletStatus: 'ready',
    encryptionReady: true,
    fundsStatus: 'low',
    storageStatus: 'blocked',
  })
  state.refreshWallet.mockClear()
  const view = render(<Content />)
  const wallet = screen.getByRole('button', { name: 'Wallet and Storage' })
  expect(wallet.getAttribute('aria-description')).toBe('Storage funds running low')
  expect(wallet.querySelector('.bg-warning')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Upload files' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(wallet)
  expect(state.refreshWallet).toHaveBeenCalledOnce()
  state.fundsStatus = 'available'
  state.storageStatus = 'ready'
  view.rerender(<Content />)
  expect(wallet.querySelector('.bg-success')).toBeTruthy()
  expect(wallet.getAttribute('aria-description')).toBeNull()
})

it('leaves pending transaction messaging to the header while keeping uploads disabled', () => {
  Object.assign(state, {
    sessionStatus: 'active',
    walletStatus: 'ready',
    storageStatus: 'ready',
    encryptionReady: true,
    fundsStatus: 'available',
    busy: true,
    pending: { kind: 'deposit' },
  })
  const view = render(<Content />)
  expect(screen.queryByText('Waiting for storage deposit confirmation.')).toBeNull()
  expect(screen.queryByText('Complete the current wallet operation first.')).toBeNull()
  expect((screen.getByRole('button', { name: 'Upload files' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'View transaction' })).toBeNull()
  state.busy = false
  state.pending = null
  view.rerender(<Content />)
  expect(screen.queryByText('Waiting for storage deposit confirmation.')).toBeNull()
  expect((screen.getByRole('button', { name: 'Upload files' }) as HTMLButtonElement).disabled).toBe(false)
})

it('shows one funding notice for empty funds and hides it throughout deposit signing and confirmation', () => {
  Object.assign(state, {
    sessionStatus: 'active',
    walletStatus: 'ready',
    storageStatus: 'blocked',
    encryptionReady: true,
    fundsStatus: 'needed',
    busy: false,
    pending: null,
  })
  const notice = 'Storage funds are running low. Add funds to resume uploads.'
  const view = render(<Content />)
  expect(screen.getAllByText(notice)).toHaveLength(1)
  state.busy = true
  view.rerender(<Content />)
  expect(screen.queryByText(notice)).toBeNull()
  expect(screen.queryByText('Complete the current wallet operation first.')).toBeNull()
  expect((screen.getByRole('button', { name: 'Upload files' }) as HTMLButtonElement).disabled).toBe(true)
  state.pending = { kind: 'deposit' }
  view.rerender(<Content />)
  expect(screen.queryByText('Waiting for storage deposit confirmation.')).toBeNull()
  state.busy = false
  state.pending = null
  view.rerender(<Content />)
  expect(screen.getAllByText(notice)).toHaveLength(1)
  state.storageStatus = 'ready'
  state.fundsStatus = 'available'
  view.rerender(<Content />)
  expect(screen.queryByText(notice)).toBeNull()
  expect((screen.getByRole('button', { name: 'Upload files' }) as HTMLButtonElement).disabled).toBe(false)
})
