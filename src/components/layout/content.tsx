import { File, Folder, Loader2, TriangleAlert, Wallet } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useUploadTasks } from '../../context/upload-tasks-context.tsx'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { useUploadReadiness } from '../../hooks/use-upload-readiness.ts'
import type { SetupTarget } from '../../utils/upload/upload-readiness.ts'
import { DeveloperFooter } from '../drive/developer-footer.tsx'
import { FileBrowser } from '../drive/file-browser.tsx'
import { FolderPicker } from '../drive/folder-picker.tsx'
import { SidePanel } from '../drive/side-panel.tsx'
import { WalletSetup } from '../drive/wallet-controls.tsx'
import { Alert } from '../ui/alert.tsx'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'
import DragNDrop from '../upload/drag-n-drop.tsx'

export default function Content() {
  const connection = useBrowserWallet()
  const { wallet, refreshWallet } = useFilecoinPinContext()
  const tasks = useUploadTasks()
  const [folder, setFolder] = useState('')
  const [uploadFolder, setUploadFolder] = useState('')
  const [uploadKind, setUploadKind] = useState<'file' | 'folder'>('file')
  const [panel, setPanel] = useState<'wallet' | 'upload' | null>(null)
  const [setupRequest, setSetupRequest] = useState<{ target: SetupTarget } | undefined>()
  const readiness = useUploadReadiness()
  const canUpload = readiness.canUpload
  const setupChecking = readiness.checking
  const openWallet = useCallback((target?: SetupTarget) => {
    setSetupRequest(target ? { target } : undefined)
    setPanel('wallet')
  }, [])
  useEffect(() => {
    const open = (event: Event) => openWallet((event as CustomEvent<{ target?: SetupTarget }>).detail?.target)
    window.addEventListener('drive-open-wallet', open)
    return () => window.removeEventListener('drive-open-wallet', open)
  }, [openWallet])
  const handleSetupAction = () => {
    if (readiness.checkFailed) void refreshWallet()
    else openWallet(readiness.actionTarget)
  }
  const openUpload = (location: string) => {
    setUploadFolder(location)
    if (canUpload) setPanel('upload')
    else handleSetupAction()
  }

  return (
    <main className="mx-auto max-w-[1440px] space-y-4 px-5 py-5 sm:px-8 lg:px-12 lg:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your files</h1>
          <p className="mt-1 text-sm text-muted">Store and manage files on Filecoin.</p>
        </div>
        <Button
          aria-label="Wallet and Storage"
          className="w-auto"
          onClick={() => {
            setUploadFolder(folder)
            openWallet()
          }}
          size="sm"
          variant="secondary"
        >
          <Wallet aria-hidden="true" size={15} />
          Wallet and Storage
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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning-border bg-warning-surface px-4 py-2">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <TriangleAlert aria-hidden="true" className="shrink-0 text-warning" size={16} />
            {readiness.message}
          </p>
          <button
            className="inline-flex min-h-8 shrink-0 items-center rounded-md border border-warning-border bg-surface px-3 py-1 text-sm font-medium text-foreground transition-colors hover:bg-warning/10 focus:brand-outline"
            onClick={handleSetupAction}
            type="button"
          >
            {readiness.actionLabel}
          </button>
        </div>
      )}
      {wallet.status === 'error' && <Alert message={wallet.error} variant="error" />}
      <span className="sr-only" role="status">
        {setupChecking ? 'Checking wallet setup…' : canUpload ? 'Session ready' : 'Setup required'}
      </span>
      <FileBrowser folder={folder} onFolderChange={setFolder} onUpload={openUpload} uploadDisabled={!canUpload} />
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
        title="Wallet and Storage"
      >
        <WalletSetup
          inDrawer
          onContinueUpload={() => {
            if (canUpload) setPanel('upload')
          }}
          setupRequest={setupRequest}
        />
      </SidePanel>
      <SidePanel
        description="Choose a location, then upload a file or an entire folder."
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
                <span className="shrink-0 text-sm text-muted">My Drive /</span>
                <input
                  aria-describedby="upload-path-help"
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
                  disabled={connection.busy}
                  id="upload-folder"
                  onChange={(event) => setUploadFolder(event.target.value)}
                  placeholder="Choose a folder (optional)"
                  value={uploadFolder}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted" id="upload-path-help">
                Leave empty to upload to My Drive. Use / for subfolders, e.g. documents/2026.
              </p>
              <details className="mt-3 text-xs text-muted">
                <summary className="w-fit cursor-pointer hover:text-foreground">Name and folder requirements</summary>
                <p className="mt-2 leading-relaxed">
                  File names and full folder paths each allow 96 UTF-8 bytes; uploaded folder names allow 95. Names and
                  paths are public and cannot be changed after upload.
                </p>
              </details>
            </div>
            <fieldset
              aria-label="Upload type"
              className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1"
            >
              {(['file', 'folder'] as const).map((kind) => {
                const Icon = kind === 'file' ? File : Folder
                return (
                  <button
                    aria-pressed={uploadKind === kind}
                    className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${uploadKind === kind ? 'bg-surface-raised text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}
                    key={kind}
                    onClick={() => setUploadKind(kind)}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={16} />
                    {kind === 'file' ? 'File' : 'Folder'}
                  </button>
                )
              })}
            </fieldset>
            {uploadKind === 'folder' ? (
              <FolderPicker
                disabled={connection.busy}
                onUpload={(source) => {
                  void tasks?.start(source, uploadFolder).then((started) => {
                    if (started) setPanel(null)
                  })
                }}
              />
            ) : (
              <DragNDrop
                isUploading={connection.busy}
                key={panel === 'upload' ? 'picker' : 'closed'}
                onUpload={(files) => {
                  void tasks?.startMany(files, uploadFolder).then((started) => {
                    if (started) setPanel(null)
                  })
                }}
              />
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Complete wallet setup before uploading.</p>
            <Button onClick={handleSetupAction} size="sm">
              Set up wallet
            </Button>
          </>
        )}
      </SidePanel>
    </main>
  )
}
