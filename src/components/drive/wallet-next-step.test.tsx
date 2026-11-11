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
  encryptionReady: true,
  session: {} as { encryption?: object } | null,
  busy: false,
  pending: null as object | null,
  refresh: vi.fn(),
}))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({
    sessionStatus: state.sessionStatus,
    session: state.session,
    busy: state.busy,
    pendingTransaction: state.pending,
  }),
}))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    wallet: { status: state.walletStatus },
    synapse: {},
    encryption: { ready: state.encryptionReady },
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
    encryptionReady: true,
    session: {},
    busy: false,
    pending: null,
  })
  state.refresh.mockClear()
})

const renderStep = (review = vi.fn(), proceed = vi.fn()) => {
  render(<WalletNextStep encryptionReady={state.encryptionReady} onContinue={proceed} onReview={review} />)
  return { review, proceed }
}

it.each([
  ['session', 'Review session authorization', { sessionStatus: 'inactive' }],
  ['encryption', 'Review encryption key', { encryptionReady: false }],
  ['gas', 'Review gas balance', { gasReady: false }],
  ['deposit', 'Go to deposit', { depositReady: false }],
  ['approval', 'Review payment approval', { approvalReady: false }],
] as const)('guides the user to %s without submitting a wallet operation', (target, label, patch) => {
  Object.assign(state, patch, { storageStatus: 'blocked' })
  const { review, proceed } = renderStep()
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
  renderStep()
  expect(screen.getByRole('button', { name: 'Review gas balance' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Review session authorization' })).toBeNull()
})

it('asks for the encryption key only after the session is authorized', () => {
  state.sessionStatus = 'inactive'
  state.encryptionReady = false
  state.storageStatus = 'blocked'
  renderStep()
  expect(screen.getByRole('button', { name: 'Review session authorization' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Review encryption key' })).toBeNull()
})

it('prioritizes the free encryption step over gas once the session is active', () => {
  state.gasReady = false
  state.encryptionReady = false
  state.storageStatus = 'blocked'
  const { review } = renderStep()
  expect(screen.queryByRole('button', { name: 'Review gas balance' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Review encryption key' }))
  expect(review).toHaveBeenCalledWith('encryption')
})

it('offers the restore variant when a stale grant exists after re-authorization', () => {
  state.encryptionReady = false
  state.session = { encryption: {} }
  const { review } = renderStep()
  expect(screen.queryByRole('button', { name: 'Review encryption key' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Restore encryption access' }))
  expect(review).toHaveBeenCalledWith('encryption')
})

it('skips the encryption step once the key is ready', () => {
  state.depositReady = false
  state.storageStatus = 'blocked'
  renderStep()
  expect(screen.getByRole('button', { name: 'Go to deposit' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Review encryption key' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Restore encryption access' })).toBeNull()
})

it('offers Continue only when every prerequisite is ready', () => {
  const { proceed } = renderStep()
  fireEvent.click(screen.getByRole('button', { name: 'Continue to upload' }))
  expect(proceed).toHaveBeenCalledOnce()
})

it.each(['checking', 'pending', 'busy'])('does not offer another setup action while %s', (kind) => {
  if (kind === 'checking') state.sessionStatus = 'checking'
  if (kind === 'pending') state.pending = { kind: 'approve' }
  if (kind === 'busy') state.busy = true
  state.encryptionReady = false
  renderStep()
  expect(screen.queryByRole('button')).toBeNull()
})

it('retries failed reads without treating them as missing funds', () => {
  state.walletStatus = 'error'
  state.storageStatus = 'error'
  state.gasReady = false
  renderStep()
  fireEvent.click(screen.getByRole('button', { name: 'Retry checks' }))
  expect(state.refresh).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: 'Go to deposit' })).toBeNull()
})

it('shows exactly five prerequisites and distinguishes funded storage from payment approval', () => {
  state.approvalReady = false
  state.storageStatus = 'blocked'
  renderStep()
  expect(screen.getAllByRole('listitem')).toHaveLength(5)
  expect(screen.getByLabelText('Storage funds available')).toBeTruthy()
  expect(screen.getByLabelText('Storage payments not approved')).toBeTruthy()
  expect(screen.getByLabelText('Encryption key added')).toBeTruthy()
  expect(screen.getByText('4 of 5 ready')).toBeTruthy()
})

it('keeps a waiting upload visible after wallet setup is complete', () => {
  const review = vi.fn()
  const proceed = vi.fn()
  render(<WalletNextStep encryptionReady onContinue={proceed} onReview={review} pendingFunding />)
  expect(screen.getByText('An upload is waiting for funding')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Continue to upload' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Review waiting upload' }))
  expect(review).toHaveBeenCalledWith('deposit')
  expect(proceed).not.toHaveBeenCalled()
})
