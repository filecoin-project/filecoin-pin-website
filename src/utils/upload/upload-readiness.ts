import type { UploadCheckpoint } from '../../lib/filecoin-pin/upload-checkpoint.ts'

export type SetupTarget = 'session' | 'encryption' | 'gas' | 'deposit' | 'approval'
export type UploadFailureCode = SetupTarget | 'unsupported_wallet' | 'unknown'
export class UploadSetupError extends Error {
  readonly code: UploadFailureCode
  constructor(code: UploadFailureCode, message: string) {
    super(message)
    this.code = code
    this.name = 'UploadSetupError'
  }
}
export interface UploadBlocker {
  code: UploadFailureCode
  message: string
  target?: SetupTarget
}
export interface UploadSetupInput {
  sessionStatus: string
  encryptionReady: boolean
  walletStatus: string
  hasClient: boolean
  busy?: boolean
  storage?: { status: string; gasReady: boolean; depositReady: boolean; approvalReady: boolean } | null
  walletError?: string | null
}
export function classifyUploadFailure(message = ''): UploadFailureCode {
  if (/not deterministic|ECDSA signature|cannot root a keyspace/i.test(message)) return 'unsupported_wallet'
  if (/add your encryption key|encryption key.*not ready/i.test(message)) return 'encryption'
  if (/session.*(?:expired|revoked|not authorized)|authorize.*(?:browser|session)/i.test(message)) return 'session'
  if (/insufficient.*FIL|insufficient.*gas|gas balance|FIL balance/i.test(message)) return 'gas'
  return 'unknown'
}
export function uploadFailureMessage(message?: string, code = classifyUploadFailure(message)) {
  return code === 'unsupported_wallet'
    ? 'This wallet cannot set up encryption. Use a supported wallet to upload.'
    : (message ?? 'Upload failed')
}
export function getUploadReadiness(input: UploadSetupInput) {
  const checking =
    input.sessionStatus === 'checking' ||
    ['idle', 'loading'].includes(input.walletStatus) ||
    input.storage?.status === 'checking'
  const checkFailed = input.walletStatus === 'error' || input.storage?.status === 'error'
  const storageVerified = !checkFailed && !checking && Boolean(input.storage)
  const blockers: UploadBlocker[] = []
  const add = (code: UploadFailureCode, message: string, target?: SetupTarget) =>
    blockers.push({ code, message, target })
  if (!input.encryptionReady && classifyUploadFailure(input.walletError ?? '') === 'unsupported_wallet')
    add('unsupported_wallet', 'Use a supported wallet to add your encryption key.', 'encryption')
  if (input.sessionStatus === 'active' && !input.encryptionReady)
    add('encryption', 'Add your encryption key to upload.', 'encryption')
  if (storageVerified && !input.storage?.gasReady) add('gas', 'Add FIL for transaction fees to upload.', 'gas')
  if (input.sessionStatus !== 'active') add('session', 'Authorize this browser to upload.', 'session')
  if (input.sessionStatus !== 'active' && !input.encryptionReady)
    add('encryption', 'Add your encryption key to upload.', 'encryption')
  if (storageVerified && !input.storage?.depositReady) add('deposit', 'Add storage funds to upload.', 'deposit')
  if (storageVerified && !input.storage?.approvalReady)
    add('approval', 'Approve storage payments to upload.', 'approval')
  const verified = input.walletStatus === 'ready' && input.storage?.status === 'ready' && input.hasClient
  const message = checking
    ? 'Checking wallet setup…'
    : input.busy
      ? 'Complete the current wallet operation first.'
      : checkFailed
        ? 'Unable to check wallet setup. Retry the checks to continue.'
        : (blockers[0]?.message ?? 'Refresh Wallet setup before uploading.')
  const actionLabels: Record<UploadFailureCode, string> = {
    session: 'Authorize browser',
    encryption: 'Add encryption key',
    gas: 'Add FIL',
    deposit: 'Add storage funds',
    approval: 'Approve payments',
    unsupported_wallet: 'Review wallet',
    unknown: 'Set up wallet',
  }
  const actionLabel = checkFailed ? 'Retry checks' : actionLabels[blockers[0]?.code ?? 'unknown']
  const actionTarget = checkFailed ? undefined : blockers[0]?.target
  return {
    actionLabel,
    actionTarget,
    checkFailed,
    canUpload: verified && !checking && !input.busy && blockers.length === 0,
    checking,
    blockers,
    message,
  }
}
export function getRetryBlocker(
  code: UploadFailureCode,
  readiness: ReturnType<typeof getUploadReadiness>
): UploadBlocker | undefined {
  if (code === 'unknown') return undefined
  if (readiness.checkFailed) return { code, message: 'Unable to verify wallet setup. Retry the setup checks.' }
  if (readiness.checking) return { code, message: 'Checking wallet setup before retrying.' }
  const blocker = readiness.blockers.find(
    (blocker) => blocker.code === code || (code === 'unsupported_wallet' && blocker.code === 'encryption')
  )
  if (blocker) return blocker
  if (readiness.blockers.length > 0) return readiness.blockers[0]
  if (!readiness.canUpload && readiness.blockers.length === 0) return { code, message: readiness.message }
  return undefined
}

export function getUploadFailureCode(
  upload: Pick<UploadCheckpoint, 'phase' | 'funding' | 'errorCode' | 'error'>
): UploadFailureCode {
  if (upload.phase === 'funding')
    return upload.funding && BigInt(upload.funding.depositNeeded) > 0n ? 'deposit' : 'approval'
  return upload.errorCode ?? classifyUploadFailure(upload.error)
}
export function getUploadRetryBlocker(upload: UploadCheckpoint, readiness: ReturnType<typeof getUploadReadiness>) {
  return getRetryBlocker(getUploadFailureCode(upload), readiness)
}
