import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { WalletSetup } from './wallet-controls.tsx'

const state = vi.hoisted(() => ({
  sessionStatus: 'inactive',
  encryptionReady: false,
  storageStatus: 'ready',
  walletStatus: 'ready',
  resume: vi.fn(),
}))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({ sessionStatus: state.sessionStatus, session: null, busy: false, network: 'mainnet' }),
}))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    synapse: {},
    wallet: { status: state.walletStatus },
    encryption: { ready: state.encryptionReady },
    storageSetup: { status: state.storageStatus, gasReady: true, depositReady: true, approvalReady: true },
  }),
}))
vi.mock('../../context/upload-history-context.tsx', () => ({
  useUploadHistory: () => ({
    history: [
      {
        id: 'paused',
        fileName: 'report.pdf',
        upload: {
          phase: 'funding',
          expectedCopies: 2,
          providers: [],
          steps: [],
          checks: 0,
          nextCheckAt: 0,
          funding: { depositNeeded: '1000000000000000000', needsApproval: false },
        },
      },
    ],
  }),
}))
vi.mock('../../context/upload-tasks-context.tsx', () => ({
  useUploadTasks: () => ({ retainedIds: new Set(['paused']), resume: state.resume }),
}))
vi.mock('./storage-budget.tsx', () => ({
  StorageBudget: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('./storage-runway.tsx', () => ({ StorageRunway: () => null }))
beforeEach(() => {
  Object.assign(state, {
    sessionStatus: 'inactive',
    encryptionReady: false,
    storageStatus: 'ready',
    walletStatus: 'ready',
  })
  state.resume.mockReset()
})

it('keeps the funding checkpoint paused until every prerequisite is ready', () => {
  const view = render(<WalletSetup inDrawer />)
  const button = screen.getByRole('button', { name: 'Check funding and continue' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  expect(screen.getByText('Retry unavailable: Authorize this browser to upload.')).toBeTruthy()
  fireEvent.click(button)
  expect(state.resume).not.toHaveBeenCalled()
  state.sessionStatus = 'active'
  view.rerender(<WalletSetup inDrawer />)
  expect(button.disabled).toBe(true)
  expect(screen.getByText('Retry unavailable: Add your encryption key to upload.')).toBeTruthy()
  state.encryptionReady = true
  view.rerender(<WalletSetup inDrawer />)
  expect(button.disabled).toBe(false)
  expect(screen.queryByText(/Retry unavailable/)).toBeNull()
  fireEvent.click(button)
  expect(state.resume).toHaveBeenCalledExactlyOnceWith('paused')
})
it('does not resume funding while configuration reads are failing', () => {
  Object.assign(state, {
    sessionStatus: 'active',
    encryptionReady: true,
    storageStatus: 'error',
    walletStatus: 'error',
  })
  render(<WalletSetup inDrawer />)
  expect((screen.getByRole('button', { name: 'Check funding and continue' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText(/Retry unavailable: Unable to verify/)).toBeTruthy()
  expect(state.resume).not.toHaveBeenCalled()
})
