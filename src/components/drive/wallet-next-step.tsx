import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'

export type SetupTarget = 'session' | 'encryption' | 'gas' | 'deposit' | 'approval'

export function WalletNextStep({
  encryptionReady,
  onReview,
  onContinue,
  pendingFunding = false,
}: {
  encryptionReady: boolean
  onReview: (target: SetupTarget) => void
  onContinue: () => void
  pendingFunding?: boolean
}) {
  const connection = useBrowserWallet()
  const { wallet, synapse, storageSetup, refreshWallet } = useFilecoinPinContext()
  const disabled =
    connection.busy || connection.uploading || connection.deleting || Boolean(connection.pendingTransaction)
  let title: string
  let description: string
  let target: SetupTarget | undefined
  let action: string | undefined
  let ready = false
  let checking = false
  let retry = false
  if (connection.pendingTransaction) {
    title = 'Waiting for transaction confirmation'
    description = 'Your transaction has not been confirmed yet. Check its status before submitting again.'
    checking = true
  } else if (connection.busy) {
    title = 'Complete the request in your wallet'
    description = 'Confirm or cancel the open wallet request to continue.'
    checking = true
  } else if (wallet.status === 'error' || storageSetup?.status === 'error') {
    title = 'Unable to check storage setup'
    description = 'Your balances or payment approval could not be verified. Retry the checks before continuing.'
    action = 'Retry checks'
    retry = true
  } else if (
    connection.sessionStatus === 'checking' ||
    wallet.status === 'idle' ||
    wallet.status === 'loading' ||
    storageSetup?.status === 'checking'
  ) {
    title = 'Checking storage setup…'
    description = 'Checking your session, balances and payment approval.'
    checking = true
  } else if (connection.sessionStatus === 'active' && !encryptionReady) {
    // The signature is free and needs only the live session key, so it outranks
    // gas, which the remaining on-chain steps need — but never the session step.
    if (connection.session?.encryption) {
      title = 'Restore encryption access'
      description =
        'Your session was re-authorized, so encryption access needs 1 wallet signature to be restored — no transaction, no fee. Only sign it here.'
      action = 'Restore encryption access'
    } else {
      title = 'Add your encryption key'
      description =
        'Uploads are encrypted by default. Your wallet signs 1 message (2 for a brand-new key) — no transaction, no fee. This signature is your encryption key, so only sign it here, never from a link or another site.'
      action = 'Review encryption key'
    }
    target = 'encryption'
  } else if (!storageSetup?.gasReady) {
    title = 'Add FIL for transaction fees'
    description = 'Send FIL to your connected wallet, then refresh balances. FIL pays gas; USDFC pays for storage.'
    action = 'Review gas balance'
    target = 'gas'
  } else if (connection.sessionStatus !== 'active') {
    title = 'Authorize this browser'
    description = 'Review the session permissions and choose how long this browser can upload and delete files.'
    action = 'Review session authorization'
    target = 'session'
  } else if (!storageSetup.depositReady) {
    title = 'Add funds for storage'
    description = 'Deposit USDFC from your wallet into your storage account.'
    action = 'Go to deposit'
    target = 'deposit'
  } else if (!storageSetup.approvalReady) {
    title = 'Approve storage payments'
    description = 'Your storage account has funds. Review the approval so storage services can charge this balance.'
    action = 'Review payment approval'
    target = 'approval'
  } else if (pendingFunding) {
    title = 'An upload is waiting for funding'
    description =
      'Review the waiting upload below. After depositing or approving payments, recheck funding to continue.'
    action = 'Review waiting upload'
    target = 'deposit'
  } else if (synapse && wallet.status === 'ready' && storageSetup.status === 'ready') {
    title = 'Ready to upload'
    description = 'Wallet setup complete. Each upload checks its actual funding needs before transferring.'
    action = 'Continue to upload'
    ready = true
  } else {
    title = 'Confirm storage setup'
    description = 'Refresh balances to confirm your setup before uploading.'
    action = 'Refresh balances'
    retry = true
  }
  const steps = [
    {
      key: 'gas',
      label: 'Gas',
      complete: storageSetup?.gasReady,
      status: storageSetup?.gasReady ? 'Gas balance sufficient' : 'Gas balance insufficient',
    },
    {
      key: 'session',
      label: 'Session',
      complete: connection.sessionStatus === 'active',
      status:
        connection.sessionStatus === 'checking'
          ? 'Checking session authorization'
          : connection.sessionStatus === 'active'
            ? 'Session authorized'
            : 'Session not authorized',
    },
    {
      key: 'encryption',
      label: 'Encryption',
      complete: encryptionReady,
      status: encryptionReady ? 'Encryption key added' : 'Encryption key needed',
    },
    {
      key: 'deposit',
      label: 'Funds',
      complete: storageSetup?.depositReady,
      status: storageSetup?.depositReady ? 'Storage funds available' : 'Storage funds needed',
    },
    {
      key: 'approval',
      label: 'Payments',
      complete: storageSetup?.approvalReady,
      status: storageSetup?.approvalReady ? 'Storage payments approved' : 'Storage payments not approved',
    },
  ]
  return (
    <section aria-label="Next step" className="border-b border-border pb-5">
      <div className="flex items-center justify-between text-xs">
        <p className="font-medium text-foreground">Upload setup</p>
        <p className="tabular-nums text-muted">
          {steps.filter((step) => step.complete).length} of {steps.length} ready
        </p>
      </div>
      <ol aria-label="Storage setup checklist" className="mt-4 grid grid-cols-5">
        {steps.map((step, index) => (
          <li aria-label={step.status} className="relative flex flex-col items-center gap-1.5" key={step.key}>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[calc(50%+14px)] top-2.5 h-px w-[calc(100%-28px)] bg-border"
              />
            )}
            <span
              aria-hidden="true"
              className={`relative flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${step.complete ? 'bg-emerald-500/10 text-success' : target === step.key ? 'bg-brand-800/15 text-accent' : 'bg-surface-raised text-muted'}`}
            >
              {step.complete ? <Check size={12} /> : index + 1}
            </span>
            <span className={`text-[11px] ${target === step.key ? 'font-medium text-accent' : 'text-muted'}`}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-5" role="status">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {checking && (
            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none text-muted" size={14} />
          )}
          {title}
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>
      {action && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            className="min-h-8 w-auto gap-1.5 px-3 py-1.5 text-xs"
            disabled={disabled}
            onClick={() => {
              if (ready) onContinue()
              else if (retry) void refreshWallet()
              else if (target) onReview(target)
            }}
            size="sm"
            variant={ready ? 'primary' : 'secondary'}
          >
            {action}
            {!retry && <ArrowRight aria-hidden="true" size={13} />}
          </Button>
          {target === 'gas' && (
            <Button
              className="min-h-8 w-auto px-3 py-1.5 text-xs"
              disabled={disabled}
              onClick={() => void refreshWallet()}
              size="sm"
              variant="secondary"
            >
              Refresh balances
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
