import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Content from './content.tsx'

const state = vi.hoisted(() => ({
  sessionStatus: 'none',
  walletStatus: 'idle',
  storageStatus: 'checking',
  encryptionReady: true,
  refreshWallet: vi.fn(),
  startMany: vi.fn().mockResolvedValue(true),
  start: vi.fn().mockResolvedValue(true),
}))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({ sessionStatus: state.sessionStatus, network: 'mainnet', setUploading: vi.fn() }),
}))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    wallet: { status: state.walletStatus },
    synapse: {},
    encryption: { ready: state.encryptionReady },
    storageSetup: { status: state.storageStatus, gasReady: true, depositReady: true, approvalReady: true },
    refreshWallet: state.refreshWallet,
  }),
}))
vi.mock('../../context/upload-tasks-context.tsx', () => ({
  useUploadTasks: () => ({ transferring: false, startMany: state.startMany, start: state.start }),
}))
vi.mock('../drive/file-browser.tsx', () => ({
  FileBrowser: ({ uploadDisabled, onUpload }: { uploadDisabled: boolean; onUpload: (path: string) => void }) => (
    <button disabled={uploadDisabled} onClick={() => onUpload('')} type="button">
      Upload files
    </button>
  ),
}))
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

it('blocks privacy selection until the encryption key is ready and updates without reloading', () => {
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

vi.mock('../upload/drag-n-drop.tsx', () => ({
  default: ({ onUpload }: { onUpload: (files: File[]) => void }) => (
    <button onClick={() => onUpload([new File(['hello'], 'hello.txt')])} type="button">
      Submit files
    </button>
  ),
}))
vi.mock('../drive/folder-picker.tsx', () => ({
  FolderPicker: ({ onUpload }: { onUpload: (source: object) => void }) => (
    <button onClick={() => onUpload({ name: 'folder', files: [], size: 0 })} type="button">
      Submit folder
    </button>
  ),
}))
it.each(['file', 'folder'])(
  'uploads a public %s after encryption setup and resets the next upload to private',
  async (kind) => {
    Object.assign(state, {
      sessionStatus: 'active',
      walletStatus: 'ready',
      storageStatus: 'ready',
      encryptionReady: true,
    })
    state.startMany.mockClear()
    state.start.mockClear()
    render(<Content />)
    fireEvent.click(screen.getByRole('button', { name: 'Upload files' }))
    const toggle = screen.getByRole('switch', { name: 'Encrypt upload (private)' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('button', { name: 'Submit files' })).toBeTruthy()
    fireEvent.click(toggle)
    expect(screen.getByText(/Once public, files cannot be made private/)).toBeTruthy()
    if (kind === 'folder') fireEvent.click(screen.getByRole('button', { name: 'Folder' }))
    fireEvent.click(screen.getByRole('button', { name: kind === 'file' ? 'Submit files' : 'Submit folder' }))
    const { waitFor } = await import('@testing-library/react')
    await waitFor(() =>
      expect(kind === 'file' ? state.startMany : state.start).toHaveBeenCalledWith(
        expect.anything(),
        '',
        ...(kind === 'file' ? [false] : [undefined, false])
      )
    )
    await waitFor(() => expect(screen.queryByRole('switch')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Upload files' }))
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  }
)
