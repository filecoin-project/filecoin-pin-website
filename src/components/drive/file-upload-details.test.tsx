import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { FileUploadDetails } from './file-upload-details.tsx'

const state = vi.hoisted(() => ({ encryptionReady: false, sessionStatus: 'active', start: vi.fn() }))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({ sessionStatus: state.sessionStatus, busy: false }),
}))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    wallet: { status: 'ready' },
    synapse: {},
    encryption: { ready: state.encryptionReady },
    storageSetup: { status: 'ready', gasReady: true, depositReady: true, approvalReady: true },
  }),
}))
vi.mock('../../context/upload-history-context.tsx', () => ({
  useUploadHistory: () => ({ mutateHistory: vi.fn(), hasUnsavedChanges: false }),
}))
vi.mock('../../context/upload-tasks-context.tsx', () => ({
  useUploadTasks: () => ({
    activeIds: new Set(),
    queuedIds: new Set(),
    retainedIds: new Set(),
    checking: new Set(),
    start: state.start,
  }),
}))
const file = {
  fileSize: '1 KB',
  cid: '',
  providerName: '',
  datasetId: '',
  providerId: '',
  serviceURL: '',
  transactionHash: '',
  uploadedAt: 0,
  id: 'test',
  fileName: 'test.txt',
  network: 'mainnet',
  pieceCid: '',
  upload: {
    phase: 'failed',
    providers: [],
    expectedCopies: 1,
    steps: [],
    checks: 0,
    nextCheckAt: 0,
    error: 'Add your encryption key in Wallet setup before uploading.',
  },
} as DatasetPiece
beforeEach(() => {
  state.sessionStatus = 'active'
  state.encryptionReady = false
  state.start.mockClear()
})
it('shows the failure outside diagnostics, routes repair, and re-enables retry without remounting', () => {
  const open = vi.fn()
  const view = render(<FileUploadDetails file={file} onOpenWallet={open} />)
  expect(screen.getByText('Add your encryption key in Wallet setup before uploading.').closest('details')).toBeNull()
  expect((screen.getByRole('button', { name: 'Retry upload' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText(/Retry unavailable/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Review Wallet setup' }))
  expect(open).toHaveBeenCalledWith('encryption')
  state.encryptionReady = true
  view.rerender(<FileUploadDetails file={file} onOpenWallet={open} />)
  expect((screen.getByRole('button', { name: 'Retry upload' }) as HTMLButtonElement).disabled).toBe(false)
  expect(screen.queryByText(/Retry unavailable/)).toBeNull()
})
it('allows retry for a provider failure even if encryption is currently unavailable', () => {
  render(
    <FileUploadDetails
      file={{
        ...file,
        upload: { ...(file.upload as NonNullable<DatasetPiece['upload']>), error: 'Provider request timed out' },
      }}
      onOpenWallet={vi.fn()}
    />
  )
  expect((screen.getByRole('button', { name: 'Retry upload' }) as HTMLButtonElement).disabled).toBe(false)
  expect(screen.queryByRole('button', { name: 'Review Wallet setup' })).toBeNull()
})

it('blocks a funded upload after session expiry and routes repair to the current missing step', () => {
  state.encryptionReady = true
  state.sessionStatus = 'inactive'
  const open = vi.fn()
  render(
    <FileUploadDetails
      file={{
        ...file,
        upload: {
          ...(file.upload as NonNullable<DatasetPiece['upload']>),
          phase: 'funding',
          funding: { depositNeeded: '1000000000000000000', needsApproval: false },
          error: 'Add storage funds to continue.',
        },
      }}
      onOpenWallet={open}
    />
  )
  expect((screen.getByRole('button', { name: 'Retry upload' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText('Retry unavailable: Authorize this browser to upload.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Review Wallet setup' }))
  expect(open).toHaveBeenCalledWith('session')
  expect(state.start).not.toHaveBeenCalled()
})
