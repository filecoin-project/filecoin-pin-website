import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Content from './content.tsx'

const state = vi.hoisted(() => ({
  sessionStatus: 'none',
  walletStatus: 'idle',
  storageStatus: 'checking',
}))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({ sessionStatus: state.sessionStatus, network: 'mainnet', setUploading: vi.fn() }),
}))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    wallet: { status: state.walletStatus },
    synapse: {},
    storageSetup: { status: state.storageStatus },
    refreshWallet: vi.fn(),
  }),
}))
vi.mock('../../hooks/use-upload-orchestration.ts', () => ({
  useUploadOrchestration: () => ({ activeUpload: { stepStates: [], isUploading: false } }),
}))
vi.mock('../drive/file-browser.tsx', () => ({
  FileBrowser: ({ uploadDisabled }: { uploadDisabled: boolean }) => (
    <button disabled={uploadDisabled} type="button">
      Upload files
    </button>
  ),
}))
vi.mock('../drive/wallet-controls.tsx', () => ({ WalletSetup: () => null }))

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
