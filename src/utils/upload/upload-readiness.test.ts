import { expect, it } from 'vitest'
import {
  classifyUploadFailure,
  getRetryBlocker,
  getUploadReadiness,
  type UploadSetupInput,
} from './upload-readiness.ts'

const ready: UploadSetupInput = {
  sessionStatus: 'active',
  encryptionReady: true,
  walletStatus: 'ready',
  hasClient: true,
  storage: { status: 'ready', gasReady: true, depositReady: true, approvalReady: true },
}
it('blocks uploads without encryption and provides the exact repair target', () => {
  const state = getUploadReadiness({ ...ready, encryptionReady: false })
  expect(state.canUpload).toBe(false)
  expect(state.blockers).toEqual([
    { code: 'encryption', target: 'encryption', message: 'Add your encryption key to upload.' },
  ])
  expect(getUploadReadiness(ready).canUpload).toBe(true)
})
it.each(['session', 'encryption', 'gas', 'deposit', 'approval'] as const)(
  'releases a %s retry when that prerequisite is repaired',
  (code) => {
    const missing = {
      ...ready,
      storage: {
        ...(ready.storage as NonNullable<UploadSetupInput['storage']>),
        [code === 'gas' ? 'gasReady' : code === 'deposit' ? 'depositReady' : 'approvalReady']: false,
      },
    }
    if (code === 'session') missing.sessionStatus = 'expired'
    if (code === 'encryption') missing.encryptionReady = false
    expect(getRetryBlocker(code, getUploadReadiness(missing))).toBeTruthy()
    expect(getRetryBlocker(code, getUploadReadiness(ready))).toBeUndefined()
  }
)
it('does not gate provider failures on unrelated wallet configuration', () => {
  expect(classifyUploadFailure('Provider gateway timed out')).toBe('unknown')
  expect(getRetryBlocker('unknown', getUploadReadiness({ ...ready, encryptionReady: false }))).toBeUndefined()
})
it('distinguishes loading from a completed missing-key check', () => {
  const loading = getUploadReadiness({ ...ready, walletStatus: 'loading' })
  expect(loading.canUpload).toBe(false)
  expect(loading.checking).toBe(true)
  expect(getRetryBlocker('encryption', loading)?.message).toMatch(/checking/i)
})
it.each([
  ['Add your encryption key in Wallet setup before uploading.', 'encryption'],
  ['Upload session expired or was revoked. Authorize it again.', 'session'],
  ['Insufficient FIL balance', 'gas'],
  ['Cannot root a keyspace', 'unsupported_wallet'],
])('classifies legacy error %s', (message, code) => expect(classifyUploadFailure(message)).toBe(code))

it('keeps unsupported-wallet retry blocked until a usable encryption key is available', () => {
  expect(getRetryBlocker('unsupported_wallet', getUploadReadiness({ ...ready, encryptionReady: false }))).toBeTruthy()
  expect(getRetryBlocker('unsupported_wallet', getUploadReadiness(ready))).toBeUndefined()
})

it.each(['wallet', 'storage'] as const)('does not interpret a %s read failure as insufficient funds', (source) => {
  const state = getUploadReadiness({
    ...ready,
    walletStatus: source === 'wallet' ? 'error' : 'ready',
    storage: {
      status: source === 'storage' ? 'error' : 'blocked',
      gasReady: false,
      depositReady: false,
      approvalReady: false,
    },
  })
  expect(state.canUpload).toBe(false)
  expect(state.checkFailed).toBe(true)
  expect(state.actionLabel).toBe('Retry checks')
  expect(state.actionTarget).toBeUndefined()
  expect(state.blockers).toEqual([])
  expect(getRetryBlocker('gas', state)?.message).toMatch(/unable to verify/i)
  expect(getRetryBlocker('unknown', state)).toBeUndefined()
})
it('offers the actual missing step once reads succeed', () => {
  const state = getUploadReadiness({
    ...ready,
    storage: { status: 'blocked', gasReady: false, depositReady: true, approvalReady: true },
  })
  expect(state.checkFailed).toBe(false)
  expect(state.actionLabel).toBe('Add FIL')
  expect(state.actionTarget).toBe('gas')
})
