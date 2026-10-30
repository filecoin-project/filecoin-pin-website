import { Folder, Loader2, ShieldCheck, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useUploadTasks } from '../../context/upload-tasks-context.tsx'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { DeveloperFooter } from '../drive/developer-footer.tsx'
import { FileBrowser } from '../drive/file-browser.tsx'
import { SidePanel } from '../drive/side-panel.tsx'
import { WalletSetup } from '../drive/wallet-controls.tsx'
import { Alert } from '../ui/alert.tsx'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'
import DragNDrop from '../upload/drag-n-drop.tsx'

export default function Content() {
  const connection = useBrowserWallet()
  const { wallet, synapse, storageSetup } = useFilecoinPinContext()
  const tasks = useUploadTasks()
  const [folder, setFolder] = useState('')
  const [uploadFolder, setUploadFolder] = useState('')
  const [panel, setPanel] = useState<'wallet' | 'upload' | null>(null)
  const canUpload = Boolean(
    connection.sessionStatus === 'active' && synapse && wallet.status === 'ready' && storageSetup?.status === 'ready'
  )
  const setupChecking =
    connection.sessionStatus === 'checking' ||
    wallet.status === 'idle' ||
    wallet.status === 'loading' ||
    storageSetup?.status === 'checking'
  const openUpload = () => {
    setUploadFolder(folder)
    setPanel(canUpload ? 'upload' : 'wallet')
  }

  return (
    <main className="mx-auto max-w-[1440px] space-y-4 px-5 py-5 sm:px-8 lg:px-12 lg:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your files</h1>
          <p className="mt-1 text-sm text-muted">Store and manage files on Filecoin.</p>
        </div>
        <Button
          aria-label="Wallet and storage"
          className="w-auto"
          onClick={() => setPanel('wallet')}
          size="sm"
          variant="secondary"
        >
          <Wallet aria-hidden="true" size={15} />
          Wallet and storage
          {setupChecking ? (
            <Loader2 aria-label="Checking wallet setup" className="animate-spin text-muted" size={14} />
          ) : (
            <span className={`h-1.5 w-1.5 rounded-full ${canUpload ? 'bg-success' : 'bg-warning'}`} />
          )}
        </Button>
      </div>
      {connection.network === 'calibration' && (
        <p className="text-xs text-muted">Calibration is a test network. Data and infrastructure may reset.</p>
      )}
      {!canUpload && !setupChecking && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-muted">
            <ShieldCheck aria-hidden="true" className="shrink-0 text-accent" size={16} />
            Configure your wallet to upload and delete files.
          </p>
          <button
            className="text-sm text-link hover:text-link-hover underline focus:brand-outline"
            onClick={() => setPanel('wallet')}
            type="button"
          >
            Set up wallet
          </button>
        </div>
      )}
      {wallet.status === 'error' && <Alert message={wallet.error} variant="error" />}
      <span className="sr-only" role="status">
        {setupChecking ? 'Checking wallet setup…' : canUpload ? 'Session ready' : 'Setup required'}
      </span>
      <FileBrowser
        folder={folder}
        onFolderChange={setFolder}
        onUpload={openUpload}
        uploadDisabled={setupChecking || connection.busy || Boolean(tasks?.transferring)}
      />
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
        <span>
          File records sync from the Filecoin index. Recent changes may take time to appear on another browser.
        </span>
        <span>Powered by Filecoin</span>
      </div>
      <DeveloperFooter />
      <SidePanel
        description="Manage browser authorization, balances and storage payments."
        onOpenChange={(open) => {
          if (!open) setPanel(null)
        }}
        open={panel === 'wallet'}
        title="Wallet and storage"
      >
        <WalletSetup inDrawer />
        <div className="space-y-3 rounded-lg border border-border bg-canvas/30 p-4">
          <p className={`text-sm ${canUpload ? 'text-success' : 'text-muted'}`} role="status">
            {setupChecking
              ? 'Checking storage setup…'
              : canUpload
                ? 'Wallet setup complete. You can upload files.'
                : connection.sessionStatus === 'active'
                  ? storageSetup?.status === 'error' || wallet.status === 'error'
                    ? 'Unable to confirm storage setup. Refresh balances to try again.'
                    : storageSetup?.gasReady
                      ? storageSetup?.depositReady
                        ? storageSetup?.approvalReady
                          ? 'Refresh balances to confirm storage setup.'
                          : 'Next: approve storage payments.'
                        : 'Next: deposit USDFC into your storage account.'
                      : 'Next: add FIL to your wallet for transaction gas, then refresh balances.'
                  : 'Next: authorize a browser session to upload files.'}
          </p>
          {canUpload && (
            <Button
              disabled={connection.busy || Boolean(tasks?.transferring)}
              onClick={() => {
                setUploadFolder(folder)
                setPanel('upload')
              }}
              size="sm"
            >
              Continue to upload
            </Button>
          )}
        </div>
      </SidePanel>
      <SidePanel
        description="Choose a location, then select or drop a file to upload."
        onOpenChange={(open) => {
          if (!open) setPanel(null)
        }}
        open={panel === 'upload'}
        title="Upload files"
      >
        {canUpload ? (
          <>
            <div className="mb-5 rounded-xl border border-border bg-surface-raised/40 p-4">
              <label className="mb-2 flex items-center gap-2 text-sm font-medium" htmlFor="upload-folder">
                <Folder aria-hidden="true" className="text-accent" size={16} />
                Upload location
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
                <span className="shrink-0 text-sm text-muted">Files /</span>
                <input
                  aria-describedby="upload-path-help"
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
                  disabled={connection.busy || Boolean(tasks?.transferring)}
                  id="upload-folder"
                  onChange={(event) => setUploadFolder(event.target.value)}
                  placeholder="Choose a folder (optional)"
                  value={uploadFolder}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted" id="upload-path-help">
                Leave empty to upload to Files. Use / for subfolders, e.g. documents/2026.
              </p>
              <details className="mt-3 text-xs text-muted">
                <summary className="w-fit cursor-pointer hover:text-foreground">Name and folder requirements</summary>
                <p className="mt-2 leading-relaxed">
                  File names and full folder paths each allow 96 UTF-8 bytes. Names and paths are public and cannot be
                  changed after upload.
                </p>
              </details>
            </div>
            <DragNDrop
              isUploading={connection.busy || Boolean(tasks?.transferring)}
              key={panel === 'upload' ? 'picker' : 'closed'}
              onUpload={(file) => {
                void tasks?.start(file, uploadFolder).then((started) => {
                  if (started) setPanel(null)
                })
              }}
            />
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Complete wallet setup before uploading.</p>
            <Button onClick={() => setPanel('wallet')} size="sm">
              Set up wallet
            </Button>
          </>
        )}
      </SidePanel>
    </main>
  )
}
