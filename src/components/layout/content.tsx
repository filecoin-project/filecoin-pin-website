import { AlertTriangle, Loader2, ShieldCheck, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { useUploadOrchestration } from '../../hooks/use-upload-orchestration.ts'
import { formatFileSize } from '../../utils/format-file-size.ts'
import { getStepLabel } from '../../utils/upload/step-utils.ts'
import { FileBrowser } from '../drive/file-browser.tsx'
import { SidePanel } from '../drive/side-panel.tsx'
import { WalletSetup } from '../drive/wallet-controls.tsx'
import { Alert } from '../ui/alert.tsx'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'
import DragNDrop from '../upload/drag-n-drop.tsx'
import { UploadError } from '../upload/upload-error.tsx'
import { UploadStatus } from '../upload/upload-status.tsx'

export default function Content() {
  const connection = useBrowserWallet()
  const { wallet, synapse, storageSetup, refreshWallet } = useFilecoinPinContext()
  // Keep the operation mounted here: closing a panel only changes its visibility.
  const orchestration = useUploadOrchestration()
  const { activeUpload, uploadedFile, startUpload, dragDropKey } = orchestration
  const [folder, setFolder] = useState('')
  const [uploadFolder, setUploadFolder] = useState('')
  const [panel, setPanel] = useState<'wallet' | 'upload' | 'activity' | null>(null)
  const [progressExpanded, setProgressExpanded] = useState(true)
  const started = useRef(false)
  const canUpload = Boolean(
    connection.sessionStatus === 'active' && synapse && wallet.status === 'ready' && storageSetup?.status === 'ready'
  )
  const setupChecking =
    connection.sessionStatus === 'checking' ||
    wallet.status === 'idle' ||
    wallet.status === 'loading' ||
    storageSetup?.status === 'checking'
  const uploadStep = activeUpload.stepStates.find((step) => step.status === 'in-progress')
  const completedSteps = activeUpload.stepStates.filter((step) => step.status === 'completed').length
  const openUpload = () => {
    setUploadFolder(folder)
    setPanel(canUpload ? 'upload' : 'wallet')
  }
  useEffect(() => {
    if (activeUpload.isUploading) started.current = true
    else if (started.current) {
      started.current = false
      connection.setUploading(false)
      void refreshWallet()
    }
  }, [activeUpload.isUploading, connection, refreshWallet])

  return (
    <main className="mx-auto max-w-[1440px] space-y-4 px-5 py-5 sm:px-8 lg:px-12 lg:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your files</h1>
          <p className="mt-1 text-sm text-muted">Store and manage files on Filecoin.</p>
        </div>
        <Button
          aria-label="Wallet & storage"
          className="w-auto"
          onClick={() => setPanel('wallet')}
          size="sm"
          variant="secondary"
        >
          <Wallet aria-hidden="true" size={15} />
          Wallet & storage
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
      {wallet.status === 'error' && (
        <Alert message={`Unable to load wallet balances: ${wallet.error}`} variant="error" />
      )}
      <span className="sr-only" role="status">
        {setupChecking ? 'Checking wallet setup…' : canUpload ? 'Session ready' : 'Setup required'}
      </span>
      <div className={uploadedFile ? 'grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]' : ''}>
        <FileBrowser
          folder={folder}
          onFolderChange={setFolder}
          onUpload={openUpload}
          uploadDisabled={setupChecking || connection.busy || connection.uploading || Boolean(uploadedFile)}
        />
        {uploadedFile && (
          <aside
            aria-label="Upload activity"
            className="order-first rounded-xl border border-border bg-surface p-4 xl:order-last"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              {activeUpload.error ? (
                <AlertTriangle aria-hidden="true" className="text-danger" size={16} />
              ) : (
                <Loader2 aria-hidden="true" className="animate-spin text-accent" size={16} />
              )}
              {activeUpload.error ? 'Upload failed' : 'Current upload'}
            </div>
            <p className="mt-2 truncate text-sm" title={uploadedFile.file.name}>
              {uploadedFile.file.name}
            </p>
            <p className="mt-1 text-xs text-muted" role="status">
              {activeUpload.error
                ? 'Open details to retry or dismiss.'
                : uploadStep
                  ? getStepLabel(uploadStep.step)
                  : 'Finishing upload…'}
            </p>
            <p className="mt-2 text-xs text-muted">
              {completedSteps} / {activeUpload.stepStates.length} stages completed
            </p>
            <Button
              className="mt-3"
              onClick={() => {
                setProgressExpanded(true)
                setPanel('activity')
              }}
              size="sm"
              variant="secondary"
            >
              View upload details
            </Button>
          </aside>
        )}
      </div>
      <footer className="flex flex-wrap justify-between gap-2 text-xs text-muted">
        <span>Export a directory backup before clearing browser data.</span>
        <span>Powered by Filecoin & IPFS</span>
      </footer>
      <SidePanel
        description="Manage browser authorization, balances and storage payments."
        onOpenChange={(open) => {
          if (!open) setPanel(null)
        }}
        open={panel === 'wallet'}
        title="Wallet & storage"
      >
        <WalletSetup inDrawer />
      </SidePanel>
      <SidePanel
        description={`Upload a file to ${uploadFolder || 'Files'}.`}
        onOpenChange={(open) => {
          if (!open) setPanel(null)
        }}
        open={panel === 'upload'}
        title="Upload files"
      >
        {canUpload ? (
          <DragNDrop
            isUploading={connection.busy || connection.uploading}
            key={dragDropKey}
            onUpload={(file) => {
              connection.setUploading(true)
              startUpload(file, uploadFolder)
              setPanel(null)
            }}
          />
        ) : (
          <>
            <p className="text-sm text-muted">Complete wallet setup before uploading.</p>
            <Button onClick={() => setPanel('wallet')} size="sm">
              Set up wallet
            </Button>
          </>
        )}
      </SidePanel>
      <SidePanel
        description="Closing this panel keeps the upload running. Keep the browser tab open until it finishes."
        onOpenChange={(open) => {
          if (!open) setPanel(null)
        }}
        open={panel === 'activity'}
        title="Upload details"
      >
        {uploadedFile ? (
          <>
            <p className="text-sm text-muted">Current upload · {uploadedFile.folderPath || 'Files'}</p>
            <UploadError
              orchestration={{
                ...orchestration,
                retryUpload: () => {
                  connection.setUploading(true)
                  orchestration.retryUpload()
                },
                cancelUpload: () => {
                  orchestration.cancelUpload()
                  setPanel(null)
                },
              }}
            />
            <UploadStatus
              cid={activeUpload.currentCid}
              confirmedCopies={activeUpload.confirmedCopies}
              expectedCopies={activeUpload.expectedCopies}
              fileName={uploadedFile.file.name}
              fileSize={formatFileSize(uploadedFile.file.size)}
              isExpanded={progressExpanded}
              onToggleExpanded={() => setProgressExpanded((expanded) => !expanded)}
              pieceCid={activeUpload.pieceCid}
              stepStates={activeUpload.stepStates}
              transactionHash={activeUpload.transactionHash ?? ''}
              transactionHashes={activeUpload.transactionHashes}
              uploadNetwork={activeUpload.network}
            />
          </>
        ) : (
          <p className="text-sm text-success" role="status">
            Upload finished. Your file is in the directory.
          </p>
        )}
      </SidePanel>
    </main>
  )
}
