import { formatUSDFC } from 'filecoin-pin/core/utils'
import { ArrowUpRight, Check, ChevronDown, KeyRound, Moon, QrCode, ShieldCheck, Sun, Wallet } from 'lucide-react'
import { useState } from 'react'
import { parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useTheme } from '../../context/theme-provider.tsx'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { approveStoragePayments, depositStorageFunds } from '../../lib/filecoin-pin/payments.ts'
import { shortenAddress } from '../../lib/filecoin-pin/wallet.ts'
import { ButtonBase } from '../ui/button/button-base.tsx'
import { Select } from '../ui/select.tsx'

export function WalletControls() {
  const wallet = useBrowserWallet()
  const { theme, toggleTheme } = useTheme()
  const [choice, setChoice] = useState('')
  return (
    <header className="border-b border-border bg-canvas">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-4 px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex shrink-0 items-center gap-3">
          <img alt="Filecoin" className="h-10 w-10 shrink-0" src="/filecoin-mark.svg" />
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
          <label className="sr-only" htmlFor="network">
            Network
          </label>
          <Select
            containerClassName="min-w-[190px] flex-1 sm:flex-none"
            disabled={wallet.busy || wallet.uploading}
            id="network"
            leadingIcon={<span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
            onChange={(event) => void wallet.switchNetwork(event.target.value as 'mainnet' | 'calibration')}
            value={wallet.network}
          >
            <option value="mainnet">Filecoin Mainnet</option>
            <option value="calibration">Calibration Testnet</option>
          </Select>
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
                disabled={wallet.busy || wallet.uploading}
                onClick={() => void wallet.disconnect()}
                size="sm"
                variant="secondary"
              >
                Disconnect
              </ButtonBase>
            </>
          ) : (
            <>
              {wallet.options.length > 1 && (
                <Select aria-label="Wallet" onChange={(event) => setChoice(event.target.value)} value={choice}>
                  <option value="">Choose wallet</option>
                  {wallet.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              )}
              <ButtonBase
                className="w-auto"
                loading={wallet.busy}
                onClick={() => void wallet.connect(choice)}
                size="sm"
              >
                <Wallet aria-hidden="true" size={15} />
                Connect wallet
              </ButtonBase>
              <ButtonBase
                className="w-auto"
                disabled={wallet.busy || !wallet.walletConnectAvailable}
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

export function WalletSetup({ inDrawer = false }: { inDrawer?: boolean }) {
  const connection = useBrowserWallet()
  const { wallet, refreshWallet, storageSetup } = useFilecoinPinContext()
  const [days, setDays] = useState(7)
  const [amount, setAmount] = useState('1')
  const [consent, setConsent] = useState(false)
  const [approvalConsent, setApprovalConsent] = useState(false)
  const [message, setMessage] = useState('')
  const active = connection.sessionStatus === 'active'
  const disabled = connection.busy || connection.uploading
  const pay = async (kind: 'deposit' | 'approve') => {
    setMessage('')
    await connection.paymentAction(async (synapse) => {
      if (kind === 'deposit') {
        const units = parseUnits(amount, 18)
        if (units <= 0n) throw new Error('Enter a positive USDFC amount')
        await depositStorageFunds(synapse, units)
      } else {
        await approveStoragePayments(synapse)
      }
      setMessage(kind === 'deposit' ? 'Deposit confirmed.' : 'Storage payment approval confirmed.')
    })
    await refreshWallet()
  }
  const Container = inDrawer ? 'section' : 'details'
  const Header = inDrawer ? 'div' : 'summary'
  return (
    <Container
      className="drive-panel group/setup"
      {...(inDrawer ? {} : { open: !active || storageSetup?.status !== 'ready' })}
    >
      <Header className="drive-summary flex items-center gap-3 p-4 sm:px-6 sm:py-5">
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
        className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border bg-canvas/20 px-5 py-3 text-xs sm:px-6"
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
      <div className={`grid gap-8 border-t border-border p-5 sm:p-6 ${inDrawer ? '' : 'lg:grid-cols-2 lg:gap-10'}`}>
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound aria-hidden="true" className="text-accent" size={16} />
            Browser session
          </h2>
          <p className="text-sm leading-6 text-muted">
            Authorize this browser to create datasets, upload files, schedule piece removals and terminate storage
            services billed to your wallet. Uploads and file deletions then use this key without repeated wallet
            prompts.
          </p>
          {connection.session && (
            <p className="rounded-lg border border-border bg-canvas/40 p-3 text-xs leading-5 text-muted break-all">
              Key {shortenAddress(privateKeyToAccount(connection.session.privateKey).address)} · expires{' '}
              {new Date(connection.session.expiresAt * 1000).toLocaleString()}
            </p>
          )}
          <details className="text-xs leading-5 text-muted">
            <summary className="cursor-pointer hover:text-foreground">How your session key is stored</summary>
            <p className="mt-2">
              The key is encrypted in this browser using a non-exportable wrapping key. Scripts running on this origin
              can still use it. Directory backups exclude the key.
            </p>
          </details>
          <label className="flex items-start gap-2.5 rounded-lg border border-border bg-canvas/30 p-3 text-xs leading-5 text-foreground">
            <input
              checked={consent}
              disabled={disabled}
              onChange={(event) => setConsent(event.target.checked)}
              type="checkbox"
            />
            I authorize all four storage permissions, including deletion, for this browser.
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
              {connection.session ? 'Renew authorization' : 'Authorize session'}
            </ButtonBase>
            {connection.session && (
              <ButtonBase
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
            <dl className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-canvas/40 p-3">
              {[
                ['Gas balance', wallet.data.formatted.fil],
                ['Wallet balance', wallet.data.formatted.usdfc],
                ['Available for storage', `${formatUSDFC(wallet.data.raw.filecoinPayBalance, 2)} USDFC`],
              ].map(([label, value]) => (
                <div className="min-w-0" key={label}>
                  <dt className="text-[10px] text-muted">{label}</dt>
                  <dd className="mt-1 truncate text-xs font-medium tabular-nums" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-sm leading-6 text-muted">
            FIL pays wallet transaction gas; deposited USDFC pays ongoing storage. Deposit and payment approvals require
            your main wallet.
          </p>
          <div className="flex flex-wrap gap-3">
            <input
              aria-label="Deposit amount in USDFC"
              className="drive-field h-10 w-28 px-3 text-sm tabular-nums"
              disabled={disabled}
              min="0"
              onChange={(event) => setAmount(event.target.value)}
              step="0.1"
              type="number"
              value={amount}
            />
            <ButtonBase
              className="w-auto"
              disabled={disabled || !amount}
              onClick={() => void pay('deposit')}
              size="sm"
              variant="secondary"
            >
              Deposit USDFC
            </ButtonBase>
          </div>
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
            <ButtonBase
              className="w-auto"
              disabled={disabled}
              onClick={() => void refreshWallet()}
              size="sm"
              variant="secondary"
            >
              Refresh balances
            </ButtonBase>
            <a
              className="inline-flex items-center gap-1 self-center text-xs text-muted hover:text-accent"
              href="https://pay.filecoin.cloud/console"
              rel="noreferrer"
              target="_blank"
            >
              Open Pay Console <ArrowUpRight aria-hidden="true" size={13} />
            </a>
          </div>
          {message && (
            <p className="text-sm text-success" role="status">
              {message}
            </p>
          )}
        </section>
      </div>
    </Container>
  )
}
