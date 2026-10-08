import { ChevronDown, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { useUploadOrchestration } from '../../hooks/use-upload-orchestration.ts'
import { formatFileSize } from '../../utils/format-file-size.ts'
import { FileBrowser } from '../drive/file-browser.tsx'
import { WalletSetup } from '../drive/wallet-controls.tsx'
import { Alert } from '../ui/alert.tsx'
import DragNDrop from '../upload/drag-n-drop.tsx'
import { UploadError } from '../upload/upload-error.tsx'
import { UploadStatus } from '../upload/upload-status.tsx'

export default function Content() {
  const connection = useBrowserWallet()
  const { wallet, synapse, storageSetup, refreshWallet } = useFilecoinPinContext()
  const orchestration = useUploadOrchestration()
  const { activeUpload, uploadedFile, startUpload, dragDropKey } = orchestration
  const [folder, setFolder] = useState('')
  const started = useRef(false)
  const canUpload = Boolean(
    connection.sessionStatus === 'active' && synapse && wallet.status === 'ready' && storageSetup?.status === 'ready'
  )
  useEffect(() => {
    if (activeUpload.isUploading) started.current = true
    else if (started.current) {
      started.current = false
      connection.setUploading(false)
      void refreshWallet()
    }
  }, [activeUpload.isUploading, connection, refreshWallet])

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-[10px] font-medium tracking-[0.16em] text-muted">YOUR STORAGE CONSOLE</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your workspace</h1>
          <p className="text-sm text-muted">A home for your files. Connected to Filecoin.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${canUpload ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {canUpload ? 'Session ready' : 'Setup required'}
        </span>
      </div>
      {connection.network === 'calibration' && (
        <Alert message="Calibration is a test network. Data and infrastructure may reset." variant="neutral" />
      )}
      <WalletSetup />
      {wallet.status === 'error' && (
        <Alert message={`Unable to load wallet balances: ${wallet.error}`} variant="error" />
      )}
      {wallet.status === 'loading' && (
        <p className="text-sm text-muted" role="status">
          Loading wallet balances…
        </p>
      )}
      {!activeUpload.isUploading && !uploadedFile && (
        <details className="drive-panel group/upload" open={!canUpload}>
          <summary className="drive-summary flex cursor-pointer items-center gap-3 p-4 sm:px-6 sm:py-5">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-800/15 text-accent"
            >
              <Upload size={18} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">Upload to {folder || 'Files'}</span>
            <ChevronDown
              aria-hidden="true"
              className="text-muted transition-transform group-open/upload:rotate-180"
              size={17}
            />
          </summary>
          <div className="border-t border-border p-5 sm:p-6">
            {canUpload ? (
              <DragNDrop
                isUploading={connection.busy || connection.uploading}
                key={dragDropKey}
                onUpload={(file) => {
                  connection.setUploading(true)
                  startUpload(file, folder)
                }}
              />
            ) : (
              <p className="text-sm text-muted">
                Connect, authorize your browser session and load wallet balances to upload. Each wallet and network has
                its own directory.
              </p>
            )}
          </div>
        </details>
      )}
      {uploadedFile && (
        <section className="space-y-3">
          <h2 className="font-medium">Current upload · {uploadedFile.folderPath || 'Files'}</h2>
          <UploadError
            orchestration={{
              ...orchestration,
              retryUpload: () => {
                connection.setUploading(true)
                orchestration.retryUpload()
              },
            }}
          />
          <UploadStatus
            cid={activeUpload.currentCid}
            confirmedCopies={activeUpload.confirmedCopies}
            expectedCopies={activeUpload.expectedCopies}
            fileName={uploadedFile.file.name}
            fileSize={formatFileSize(uploadedFile.file.size)}
            pieceCid={activeUpload.pieceCid}
            stepStates={activeUpload.stepStates}
            transactionHash={activeUpload.transactionHash ?? ''}
            transactionHashes={activeUpload.transactionHashes}
            uploadNetwork={activeUpload.network}
          />
        </section>
      )}
      <FileBrowser folder={folder} onFolderChange={setFolder} />
      <footer className="flex flex-wrap justify-between gap-3 pt-1 text-xs text-muted">
        <span>Directory saved in this browser. Export a backup to keep it portable.</span>
        <span>Powered by Filecoin & IPFS</span>
      </footer>
    </main>
  )
}
