import { ArrowRight, Check, FileText, Folder, HardDrive, KeyRound, Layers, ShieldCheck, Wallet } from 'lucide-react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { ButtonBase } from '../ui/button/button-base.tsx'

function WorkspacePreview() {
  return (
    <div
      aria-label="Illustration of the file manager"
      className="relative mx-auto w-full max-w-lg lg:ml-auto"
      role="img"
    >
      <div className="drive-panel overflow-hidden shadow-2xl shadow-black/20">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <span className="flex items-center gap-2.5 text-sm font-medium">
            <HardDrive className="text-accent" size={17} />
            Your workspace
          </span>
          <span className="rounded border border-border px-2 py-0.5 text-[10px] tracking-widest text-muted">
            PREVIEW
          </span>
        </div>
        <div className="grid grid-cols-[115px_1fr] sm:grid-cols-[140px_1fr]">
          <div className="border-r border-border bg-canvas/40 p-3 sm:p-4 space-y-4">
            <p className="text-[10px] font-medium tracking-widest text-muted">FOLDERS</p>
            <div className="flex items-center gap-2 rounded-md bg-brand-800/15 px-2 py-2 text-xs text-accent">
              <Folder size={14} />
              All files
            </div>
            <div className="flex items-center gap-2 px-2 text-xs text-muted">
              <Folder size={14} />
              Documents
            </div>
            <div className="flex items-center gap-2 px-2 text-xs text-muted">
              <Folder size={14} />
              Images
            </div>
          </div>
          <div className="min-w-0 p-5 sm:p-6">
            <div className="mb-6 flex items-center justify-between text-xs">
              <span className="text-foreground">Files</span>
              <span className="text-muted">Name · Status</span>
            </div>
            {['project-notes.md', 'research.pdf', 'photo.png'].map((name, index) => (
              <div className="flex items-center gap-3 border-b border-border/60 py-3.5" key={name}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-accent">
                  <FileText size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs sm:text-sm">{name}</p>
                  <p className="mt-1 text-[10px] text-muted">{index === 2 ? 'Images' : 'Documents'}</p>
                </div>
                <Check aria-label="Stored" className="text-success" size={14} />
              </div>
            ))}
            <div className="mt-6 flex items-center gap-2 text-[11px] text-muted">
              <Layers size={13} />
              Content-addressed. Stored on Filecoin.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-[11px] text-muted">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Your wallet, your workspace
          </span>
          <span className="flex items-center gap-1.5">
            <KeyRound size={12} />
            Session key enabled
          </span>
        </div>
      </div>
    </div>
  )
}

export function Landing() {
  const connection = useBrowserWallet()
  return (
    <main className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-12">
      <div className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
        <section className="max-w-xl space-y-6">
          <p className="flex items-center gap-2 text-xs font-medium tracking-[0.16em] text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            BUILT ON FILECOIN
          </p>
          <h1 className="text-4xl font-semibold leading-[1.12] tracking-[-0.035em] sm:text-5xl lg:text-[56px]">
            A browser drive
            <br />
            for <span className="text-accent">Filecoin</span>
          </h1>
          <p className="max-w-md text-base leading-7 text-muted">
            A familiar place for your files, with decentralized storage underneath. Connect your wallet, authorize once,
            and make it yours.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <ButtonBase
              className="w-auto"
              disabled={connection.busy || connection.options.length === 0}
              onClick={() => void connection.connect()}
            >
              Connect a wallet <ArrowRight size={16} />
            </ButtonBase>
            {connection.walletConnectAvailable && (
              <button
                className="text-sm text-muted hover:text-foreground disabled:opacity-50"
                disabled={connection.busy}
                onClick={() => void connection.connectWalletConnect()}
                type="button"
              >
                Use a mobile wallet
              </button>
            )}
          </div>
          <p className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck size={14} />
            Your wallet controls access. No account to create.
          </p>
          {connection.options.length === 0 && !connection.walletConnectAvailable && (
            <p className="text-sm text-warning">
              Install an Ethereum-compatible browser wallet, then reload this page.
            </p>
          )}
        </section>
        <WorkspacePreview />
      </div>
      <section
        aria-label="How it works"
        className="grid gap-8 border-y border-border py-8 sm:py-10 md:grid-cols-3 md:gap-10"
      >
        {[
          {
            icon: Wallet,
            step: '01',
            title: 'Bring your wallet',
            description: 'Connect on Filecoin Mainnet or Calibration. Each wallet has its own workspace.',
          },
          {
            icon: KeyRound,
            step: '02',
            title: 'Authorize once',
            description: 'A time-limited session key handles uploads and deletions without repeated prompts.',
          },
          {
            icon: Folder,
            step: '03',
            title: 'Keep everything in order',
            description: 'Upload, download and organize files in folders. Export your directory to take it with you.',
          },
        ].map(({ icon: Icon, step, title, description }) => (
          <article className="space-y-3" key={step}>
            <div className="flex items-center gap-3">
              <Icon className="text-accent" size={20} />
              <span className="font-mono text-xs text-muted">{step}</span>
            </div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="max-w-xs text-sm leading-6 text-muted">{description}</p>
          </article>
        ))}
      </section>
      <footer className="flex flex-col justify-between gap-4 py-7 text-xs leading-5 text-muted sm:flex-row">
        <p>Files live on Filecoin. Names and folders stay in this browser.</p>
        <p>Files are publicly retrievable by CID and are not encrypted.</p>
      </footer>
    </main>
  )
}
