import { expect, it } from 'vitest'
import { describeWalletError, WalletConnectionError } from './wallet-error.ts'

it('preserves wrapped and plain wallet error details', () => {
  const error = { shortMessage: 'Unexpected error', cause: { code: 4200, message: 'Unsupported method' } }
  expect(describeWalletError(error)).toBe('Unexpected error · Unsupported method · Code: 4200')
  expect(new WalletConnectionError('Phantom', 'Calibration Testnet', 'switch network', error).message).toContain(
    'Phantom: unable to switch the wallet for Calibration Testnet.'
  )
})
it('handles cyclic and empty errors without hiding the failure', () => {
  const error: { cause?: unknown; message: string } = { message: 'Rejected' }
  error.cause = error
  expect(describeWalletError(error)).toBe('Rejected')
  expect(describeWalletError(null)).toBe('The wallet did not provide an error message.')
})
