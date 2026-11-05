import { formatUSDFC } from 'filecoin-pin/core/utils'
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  KeyRound,
  Moon,
  QrCode,
  ShieldCheck,
  Sun,
  Wallet,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useTheme } from '../../context/theme-provider.tsx'
import { useUploadHistory } from '../../context/upload-history-context.tsx'
import { useUploadTasks } from '../../context/upload-tasks-context.tsx'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { chains } from '../../lib/filecoin-pin/browser-wallet.ts'
import { DEFAULT_SESSION_DAYS } from '../../lib/filecoin-pin/config.ts'
import { approveStoragePayments, depositStorageFunds } from '../../lib/filecoin-pin/payments.ts'
import { formatFundingAmount } from '../../lib/filecoin-pin/upload-funding.ts'
import { shortenAddress } from '../../lib/filecoin-pin/wallet.ts'
import { ButtonBase } from '../ui/button/button-base.tsx'
import { Select } from '../ui/select.tsx'
import { ConnectWalletButton } from './connect-wallet-button.tsx'
import { StorageBudget } from './storage-budget.tsx'
import { StorageRunway } from './storage-runway.tsx'
import { type SetupTarget, WalletNextStep } from './wallet-next-step.tsx'

export function WalletControls() {
  const wallet = useBrowserWallet()
  const { theme, toggleTheme } = useTheme()
  return (
    <header className="border-b border-border bg-canvas">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-4 px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex shrink-0 items-center gap-3">
          <img
            alt="Filecoin"
            className="h-10 w-10 shrink-0"
            src={theme === 'dark' ? '/filecoin-mark.svg#dark' : '/filecoin-mark.svg'}
          />
          <div>
            <p className="text-lg font-semibold tracking-tight">
              Filecoin <span className="font-normal text-muted">Drive</span>
            </p>
            <p className="text-[11px] text-muted">Decentralized storage, made familiar</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          <button
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            type="button"
          >
            {theme === 'dark' ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
          </button>
          {wallet.address ? (
            <>
              <span
                className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 font-mono text-xs"
                title={wallet.address}
              >
                <Wallet aria-hidden="true" className="text-muted" size={15} />
                {shortenAddress(wallet.address)}
              </span>
              <ButtonBase
                className="w-auto"
                disabled={wallet.busy || wallet.uploading || wallet.deleting || wallet.restoring}
                onClick={() => void wallet.disconnect()}
                size="sm"
                variant="secondary"
              >
                Disconnect
              </ButtonBase>
            </>
          ) : (
            <>
              <ConnectWalletButton size="sm" />
              <ButtonBase
                className="w-auto"
                disabled={wallet.busy || wallet.restoring || !wallet.walletConnectAvailable}
                onClick={() => void wallet.connectWalletConnect()}
                size="sm"
                title={
                  wallet.walletConnectAvailable
                    ? 'Connect a mobile wallet'
                    : 'WalletConnect is not configured for this site'
                }
                variant="secondary"
              >
                <QrCode aria-hidden="true" size={15} />
                WalletConnect
              </ButtonBase>
            </>
          )}
        </div>
        {wallet.pendingTransaction && (
          <div className="w-full">
            <div
              className="flex w-full flex-col gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 sm:p-5 md:flex-row md:items-center md:gap-6"
              role="status"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-warning">
                  <Clock3 aria-hidden="true" size={18} />
                </span>
                <div className="min-w-0 max-w-3xl space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {wallet.busy
                      ? 'Waiting for transaction confirmation…'
                      : 'Confirmation is taking longer than expected'}
                  </p>
                  <p className="text-sm leading-relaxed text-muted">
                    Your transaction may still confirm. Wait, or use “Speed up” in your wallet if available. Avoid
                    submitting again.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 pl-12 md:pl-0">
                <a
                  className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-accent"
                  href={`${chains[wallet.network].blockExplorers?.default.url}/tx/${wallet.pendingTransaction.hash}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View transaction <ArrowUpRight aria-hidden="true" size={14} />
                </a>
                <ButtonBase
                  className="w-auto"
                  disabled={wallet.busy || wallet.checkingTransaction}
                  onClick={wallet.refreshTransaction}
                  size="sm"
                  variant="secondary"
                >
                  {wallet.checkingTransaction ? 'Checking…' : 'Refresh status'}
                </ButtonBase>
              </div>
            </div>
          </div>
        )}
        {wallet.error && (
          <p
            className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-warning break-words"
            role="alert"
          >
            {wallet.error}
          </p>
        )}
      </div>
    </header>
  )
}

export function WalletSetup({
  inDrawer = false,
  onContinueUpload,
}: {
  inDrawer?: boolean
  onContinueUpload?: () => void
}) {
  const connection = useBrowserWallet()
  const { history } = useUploadHistory()
  const tasks = useUploadTasks()
  const fundingRequests = history.filter((file) => file.upload?.phase === 'funding')
  const { wallet, refreshWallet, storageSetup } = useFilecoinPinContext()
  const [days, setDays] = useState(DEFAULT_SESSION_DAYS)
  const [amount, setAmount] = useState('')
  const lastSuggestedAmount = useRef<string | null>(null)
  const updateSuggestedAmount = useCallback((suggestion: string) => {
    const previous = lastSuggestedAmount.current
    lastSuggestedAmount.current = suggestion
    setAmount((current) => (previous === null ? current || suggestion : current === previous ? suggestion : current))
  }, [])
  const [consent, setConsent] = useState(false)
  const [approvalConsent, setApprovalConsent] = useState(false)
  const [message, setMessage] = useState('')
  const sessionTarget = useRef<HTMLElement>(null)
  const gasTarget = useRef<HTMLElement>(null)
  const depositTarget = useRef<HTMLDivElement>(null)
  const pendingFundingTarget = useRef<HTMLElement>(null)
  const approvalTarget = useRef<HTMLDivElement>(null)
  const reviewStep = (target: SetupTarget) => {
    const node = {
      session: sessionTarget,
      gas: gasTarget,
      deposit: pendingFundingTarget.current ? pendingFundingTarget : depositTarget,
      approval: approvalTarget,
    }[target].current
    if (!node) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    node.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' })
    node.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true })
    if (!reducedMotion && node.animate) {
      for (const animation of node.getAnimations()) animation.cancel()
      node.animate(
        [
          { backgroundColor: getComputedStyle(node).backgroundColor },
          { backgroundColor: 'color-mix(in srgb, var(--color-brand-500) 7%, transparent)', offset: 0.35 },
          { backgroundColor: getComputedStyle(node).backgroundColor },
        ],
        { duration: 1400, easing: 'ease-out' }
      )
    }
  }
  const applyDepositAmount = (value: string) => {
    setAmount(value)
    depositTarget.current?.scrollIntoView({ behavior: 'instant', block: 'center' })
    depositTarget.current?.querySelector('input')?.focus({ preventScroll: true })
  }
  const active = connection.sessionStatus === 'active'
  const disabled =
    connection.busy || connection.uploading || connection.deleting || Boolean(connection.pendingTransaction)
  const pay = async (kind: 'deposit' | 'approve') => {
    setMessage('')
    await connection.paymentAction(async (synapse, confirm) => {
      if (kind === 'deposit') {
        const units = parseUnits(amount, 18)
        if (units <= 0n) throw new Error('Enter a positive USDFC amount')
        await depositStorageFunds(synapse, units, confirm)
      } else {
        await approveStoragePayments(synapse, confirm)
      }
      setMessage(kind === 'deposit' ? 'Deposit confirmed.' : 'Storage payment approval confirmed.')
    }, kind)
    await refreshWallet()
  }
  const Container = inDrawer ? 'section' : 'details'
  const Header = inDrawer ? 'div' : 'summary'
  return (
    <>
      {inDrawer && onContinueUpload && (
        <WalletNextStep
          onContinue={onContinueUpload}
          onReview={reviewStep}
          pendingFunding={fundingRequests.length > 0}
        />
      )}
      <Container
        className={inDrawer ? 'group/setup' : 'drive-panel group/setup'}
        {...(inDrawer ? {} : { open: !active || storageSetup?.status !== 'ready' })}
      >
        {!(inDrawer && onContinueUpload) && (
          <>
            <Header
              className={
                inDrawer
                  ? 'drive-summary flex items-center gap-3 py-4'
                  : 'drive-summary flex items-center gap-3 p-4 sm:px-6 sm:py-5'
              }
            >
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-emerald-500/10 text-success' : 'bg-brand-800/15 text-accent'}`}
              >
                <ShieldCheck size={18} />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">
                Wallet setup ·{' '}
                {active
                  ? 'Session authorized'
                  : connection.sessionStatus === 'checking'
                    ? 'Checking session authorization…'
                    : 'Authorize a session to upload and delete'}
              </span>
              {!inDrawer && (
                <ChevronDown
                  aria-hidden="true"
                  className="text-muted transition-transform group-open/setup:rotate-180"
                  size={17}
                />
              )}
            </Header>
            <fieldset
              aria-label="Storage setup checklist"
              className={
                inDrawer
                  ? 'flex flex-wrap gap-x-5 gap-y-2 border-y border-border py-3 text-xs'
                  : 'flex flex-wrap gap-x-6 gap-y-2 border-t border-border bg-canvas/20 px-5 py-3 text-xs sm:px-6'
              }
            >
              {[
                { title: 'Session authorized', ready: active },
                { title: 'Gas balance sufficient', ready: storageSetup?.gasReady },
                { title: 'Storage funds available', ready: storageSetup?.depositReady },
                { title: 'Storage payments approved', ready: storageSetup?.approvalReady },
              ].map(({ title, ready }) => (
                <span className={`inline-flex items-center gap-2 ${ready ? 'text-success' : 'text-muted'}`} key={title}>
                  {ready ? (
                    <Check aria-hidden="true" size={13} />
                  ) : (
                    <span className="h-3 w-3 rounded-full border border-border" />
                  )}
                  {title}
                </span>
              ))}
              {storageSetup?.status === 'checking' && (
                <span className="text-muted" role="status">
                  Checking chain configuration…
                </span>
              )}
            </fieldset>
          </>
        )}
        <div
          className={
            inDrawer ? 'grid gap-7 py-5' : 'grid gap-8 border-t border-border p-5 sm:p-6 lg:grid-cols-2 lg:gap-10'
          }
        >
          <section className="scroll-mt-24 space-y-4 rounded-lg" data-setup-target="session" ref={sessionTarget}>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound aria-hidden="true" className="text-accent" size={16} />
              Browser session
            </h2>
            <p className="text-sm leading-6 text-muted">
              Authorize this browser to create datasets, upload files and schedule piece removals billed to your wallet.
              Uploads and file deletions then use this key without repeated wallet prompts.
            </p>
            {active && connection.session && (
              <p className="rounded-lg border border-border bg-canvas/40 p-3 text-xs leading-5 text-muted break-all">
                Key {shortenAddress(privateKeyToAccount(connection.session.privateKey).address)} · expires{' '}
                {new Date(connection.session.expiresAt * 1000).toLocaleString()}
              </p>
            )}
            <details className="text-xs leading-5 text-muted">
              <summary className="cursor-pointer hover:text-foreground">How your session key is stored</summary>
              <p className="mt-2">
                Your session key is stored in this browser. Scripts running on this site can access and use it.
              </p>
              <p className="mt-2">
                Anyone with this key can upload and delete data until the authorization expires or is revoked. Uploads
                can incur storage charges paid from your deposited storage balance.
              </p>
            </details>
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-canvas/30 p-3 text-xs leading-5 text-foreground">
              <input
                checked={consent}
                disabled={disabled}
                onChange={(event) => setConsent(event.target.checked)}
                type="checkbox"
              />
              I authorize storage uploads and file deletions for this browser.
            </label>
            <div className="flex flex-wrap gap-3">
              <Select
                aria-label="Session duration"
                disabled={disabled}
                onChange={(event) => setDays(Number(event.target.value))}
                value={days}
              >
                <option value={1}>1 day</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
              </Select>
              <ButtonBase
                className="w-auto"
                disabled={disabled || !consent}
                onClick={() => void connection.authorize(days)}
                size="sm"
              >
                {active ? 'Renew authorization' : 'Authorize session'}
              </ButtonBase>
              {active && connection.session && (
                <ButtonBase
                  aria-describedby="session-revoke-note"
                  className="w-auto"
                  disabled={disabled}
                  onClick={() => void connection.revoke()}
                  size="sm"
                  variant="secondary"
                >
                  Revoke session
                </ButtonBase>
              )}
            </div>
            {active && connection.session && (
              <p className="text-xs leading-5 text-muted" id="session-revoke-note">
                Revoking this session blocks future use of this key. It does not delete your files or stop existing
                storage charges.
              </p>
            )}
          </section>
          <section
            className={`space-y-4 ${inDrawer ? 'border-t border-border pt-6' : 'lg:border-l lg:border-border lg:pl-10'}`}
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Wallet aria-hidden="true" className="text-accent" size={16} />
              Storage payments
            </h2>
            {storageSetup?.gasIssue && (
              <p className="text-xs leading-5 text-warning" role="alert">
                {storageSetup.gasIssue}
              </p>
            )}
            {wallet.data && (
              <section
                className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-surface p-4"
                data-setup-target="gas"
                ref={gasTarget}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Balances</h3>
                  <button
                    aria-label="Refresh balances"
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => void refreshWallet()}
                    type="button"
                  >
                    Refresh
                  </button>
                </div>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    ['Gas balance', wallet.data.formatted.fil],
                    ['Wallet balance', wallet.data.formatted.usdfc],
                    ['Total storage deposit', `${formatUSDFC(wallet.data.raw.filecoinPayBalance, 2)} USDFC`],
                  ].map(([label, value]) => (
                    <div className="min-w-0" key={label}>
                      <dt className="text-[10px] text-muted">{label}</dt>
                      <dd className="mt-1 truncate text-xs font-medium tabular-nums" title={value}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {wallet.data && <StorageRunway />}
            {fundingRequests.map((file, index) => (
              <section
                aria-label="Pending upload funding"
                className="space-y-3 rounded-xl border border-border bg-surface p-4"
                key={file.id}
                ref={index === 0 ? pendingFundingTarget : undefined}
              >
                <h3 className="text-sm font-medium">Waiting for funding · {file.fileName}</h3>
                <p className="text-xs leading-5 text-muted">{file.upload?.error}</p>
                <div className="flex flex-wrap gap-2">
                  {file.upload?.funding && BigInt(file.upload.funding.depositNeeded) > 0n && (
                    <ButtonBase
                      className="w-auto"
                      disabled={disabled}
                      onClick={() =>
                        applyDepositAmount(formatFundingAmount(BigInt(file.upload?.funding?.depositNeeded ?? '0')))
                      }
                      size="sm"
                      variant="secondary"
                    >
                      Use upload minimum
                    </ButtonBase>
                  )}
                  {tasks?.retainedIds.has(file.id) && (
                    <ButtonBase
                      className="w-auto"
                      disabled={disabled}
                      onClick={() => void tasks.resume(file.id)}
                      size="sm"
                    >
                      Check funding and continue
                    </ButtonBase>
                  )}
                </div>
                <p className="text-xs text-muted">
                  Last checked upload minimum. Rechecked before continuing; the budget below includes additional usage.
                </p>
              </section>
            ))}
            <StorageBudget disabled={disabled} onSuggestedAmount={updateSuggestedAmount}>
              <div
                className="scroll-mt-24 space-y-3 border-t border-border p-4 sm:p-5"
                data-setup-target="deposit"
                ref={depositTarget}
              >
                <div className="flex items-end gap-2">
                  <label className="block min-w-0 flex-1 space-y-1.5">
                    <span className="text-xs text-muted">Amount to deposit</span>
                    <span className="flex items-center gap-3 rounded-lg border border-border bg-canvas/40 px-3 focus-within:ring-1 focus-within:ring-accent">
                      <input
                        aria-label="Deposit amount in USDFC"
                        className="h-11 min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none placeholder:text-muted placeholder:opacity-100"
                        disabled={disabled}
                        min="0"
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder="0.00"
                        step="any"
                        type="number"
                        value={amount}
                      />
                      <span className="text-xs font-medium text-muted">USDFC</span>
                    </span>
                  </label>
                  <ButtonBase
                    className="min-h-11 w-auto shrink-0 px-3 sm:px-4"
                    disabled={disabled || !amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0}
                    onClick={() => void pay('deposit')}
                    size="sm"
                    variant="secondary"
                  >
                    Deposit USDFC
                  </ButtonBase>
                </div>
              </div>
            </StorageBudget>
            <div
              className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-surface p-4"
              data-setup-target="approval"
              ref={approvalTarget}
            >
              <h3 className="text-sm font-medium">Payment approval</h3>
              <label className="flex items-start gap-2.5 text-xs leading-5 text-foreground">
                <input
                  checked={approvalConsent}
                  disabled={disabled}
                  onChange={(event) => setApprovalConsent(event.target.checked)}
                  type="checkbox"
                />
                Allow Warm Storage to manage payment rails with unlimited rate and lockup allowances.
              </label>
              <div className="flex flex-wrap gap-3">
                <ButtonBase
                  className="w-auto"
                  disabled={disabled || !approvalConsent}
                  onClick={() => void pay('approve')}
                  size="sm"
                  variant="secondary"
                >
                  Approve storage payments
                </ButtonBase>
                <a
                  className="inline-flex items-center gap-1 self-center text-xs text-muted hover:text-accent"
                  href="https://pay.filecoin.cloud/console"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open Filecoin User Console <ArrowUpRight aria-hidden="true" size={13} />
                </a>
              </div>
            </div>
            {message && (
              <p className="text-sm text-success" role="status">
                {message}
              </p>
            )}
          </section>
        </div>
      </Container>
    </>
  )
}
