import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { WalletNextStep } from './wallet-next-step.tsx'

const state = vi.hoisted(() => ({
  sessionStatus: 'active',
  walletStatus: 'ready',
  storageStatus: 'ready',
  gasReady: true,
  depositReady: true,
  approvalReady: true,
  busy: false,
  pending: null as object | null,
  refresh: vi.fn(),
}))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({ sessionStatus: state.sessionStatus, busy: state.busy, pendingTransaction: state.pending }),
}))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    wallet: { status: state.walletStatus },
    synapse: {},
    refreshWallet: state.refresh,
    storageSetup: {
      status: state.storageStatus,
      gasReady: state.gasReady,
      depositReady: state.depositReady,
      approvalReady: state.approvalReady,
    },
  }),
}))
beforeEach(() => {
  Object.assign(state, {
    sessionStatus: 'active',
    walletStatus: 'ready',
    storageStatus: 'ready',
    gasReady: true,
    depositReady: true,
    approvalReady: true,
    busy: false,
    pending: null,
  })
  state.refresh.mockClear()
})

it.each([
  ['session', 'Review session authorization', { sessionStatus: 'inactive' }],
  ['gas', 'Review gas balance', { gasReady: false }],
  ['deposit', 'Go to deposit', { depositReady: false }],
  ['approval', 'Review payment approval', { approvalReady: false }],
] as const)('guides the user to %s without submitting a wallet operation', (target, label, patch) => {
  Object.assign(state, patch, { storageStatus: 'blocked' })
  const review = vi.fn(),
    proceed = vi.fn()
  render(<WalletNextStep onContinue={proceed} onReview={review} />)
  fireEvent.click(screen.getByRole('button', { name: label }))
  expect(review).toHaveBeenCalledWith(target)
  expect(proceed).not.toHaveBeenCalled()
  expect(state.refresh).not.toHaveBeenCalled()
  if (target === 'approval') expect(screen.queryByRole('button', { name: 'Go to deposit' })).toBeNull()
})

it('prioritizes gas before requesting authorization when both are missing', () => {
  state.gasReady = false
  state.sessionStatus = 'none'
  state.storageStatus = 'blocked'
  render(<WalletNextStep onContinue={vi.fn()} onReview={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Review gas balance' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Review session authorization' })).toBeNull()
})

it('offers Continue only when every prerequisite is ready', () => {
  const proceed = vi.fn()
  render(<WalletNextStep onContinue={proceed} onReview={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Continue to upload' }))
  expect(proceed).toHaveBeenCalledOnce()
})

it.each(['checking', 'pending', 'busy'])('does not offer another setup action while %s', (kind) => {
  if (kind === 'checking') state.sessionStatus = 'checking'
  if (kind === 'pending') state.pending = { kind: 'approve' }
  if (kind === 'busy') state.busy = true
  render(<WalletNextStep onContinue={vi.fn()} onReview={vi.fn()} />)
  expect(screen.queryByRole('button')).toBeNull()
})

it('retries failed reads without treating them as missing funds', () => {
  state.walletStatus = 'error'
  state.storageStatus = 'error'
  state.gasReady = false
  render(<WalletNextStep onContinue={vi.fn()} onReview={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Retry checks' }))
  expect(state.refresh).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: 'Go to deposit' })).toBeNull()
})

it('shows exactly four prerequisites and distinguishes funded storage from payment approval', () => {
  state.approvalReady = false
  state.storageStatus = 'blocked'
  render(<WalletNextStep onContinue={vi.fn()} onReview={vi.fn()} />)
  expect(screen.getAllByRole('listitem')).toHaveLength(4)
  expect(screen.getByLabelText('Storage funds available')).toBeTruthy()
  expect(screen.getByLabelText('Storage payments not approved')).toBeTruthy()
  expect(screen.getByText('3 of 4 ready')).toBeTruthy()
})
