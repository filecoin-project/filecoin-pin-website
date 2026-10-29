import * as Dialog from '@radix-ui/react-dialog'
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Folder,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useUploadHistory } from '../../context/upload-history-context.tsx'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { useDownloadQueue } from '../../hooks/use-download-queue.ts'
import { useFileDeletion } from '../../hooks/use-file-deletion.ts'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { IPFS_CHECK_LIMIT, resetIndexingChecks } from '../../hooks/use-ipfs-indexing.ts'
import { displayFileName } from '../../lib/filecoin-pin/drive-api.ts'
import { canPreviewFile, fileGatewayLink } from '../../lib/filecoin-pin/file-links.ts'
import { directoryFolders } from '../../lib/local-storage/drive-directory.ts'
import { hasRemovalProgress, isDeletionScheduled } from '../../utils/file-deletion.ts'
import {
  getDatasetExplorerLink,
  getIpfsGatewayPreviewLink,
  getPieceExplorerLink,
  getTxExplorerLink,
} from '../../utils/links.ts'
import { ButtonBase as Button, buttonVariants } from '../ui/button/button-base.tsx'
import { CopyButton } from '../ui/copy-button.tsx'
import { FileTypeIcon } from './file-type-icon.tsx'
import { ProviderLink } from './provider-link.tsx'
import { ShareFileButton } from './share-file-button.tsx'

export function fileStatus(file: DatasetPiece) {
  if (isDeletionScheduled(file)) return 'Deletion scheduled'
  if (hasRemovalProgress(file)) return 'Deletion incomplete'
  if (!file.cid) return 'Metadata missing'
  if (file.ipfsIndexed === false)
    return (file.ipfsCheckAttempts ?? 0) >= IPFS_CHECK_LIMIT
      ? 'Stored · IPFS indexing unconfirmed'
      : 'Stored · IPFS indexing pending'
  return 'Stored'
}

interface Props {
  folder: string
  onFolderChange: (folder: string) => void
  onUpload?: () => void
  uploadDisabled?: boolean
}
export function FileBrowser({ folder, onFolderChange, onUpload, uploadDisabled = false }: Props) {
  const { history, updateUpload, refreshHistory, isLoading, error: directoryError } = useUploadHistory()
  const { synapse, storageScope } = useFilecoinPinContext()
  const connection = useBrowserWallet()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const { deleteFile, isDeleting, deletingPieceCid, deletionError, clearDeletionError } = useFileDeletion()
  const working = isEditing || isDeleting
  const displayStatus = (file: DatasetPiece) => (deletingPieceCid === file.pieceCid ? 'Deleting…' : fileStatus(file))
  const { download, queuedDownloads, downloadError, enqueueDownload, cancelQueuedDownload } = useDownloadQueue(
    synapse,
    storageScope
  )
  const [deleteConsent, setDeleteConsent] = useState(false)
  const [showFolders, setShowFolders] = useState(false)
  const visibleHistory = history.filter((file) => !isDeletionScheduled(file))
  const allFolders = directoryFolders(visibleHistory, [])
  const selected = history.find((file) => file.id === selectedId)
  const selectedAliases = selected ? history.filter((file) => file.pieceCid === selected.pieceCid) : []
  const allAliasesScheduled =
    selectedAliases.length > 0 && selectedAliases.every((file) => fileStatus(file) === 'Deletion scheduled')
  const affectedAliases = selectedAliases.filter((file) => !isDeletionScheduled(file))
  const hasDeletionProgress = affectedAliases.some(hasRemovalProgress)
  const disabled = working || Boolean(download) || connection.busy || connection.deleting
  const isQueued = (id: string) => queuedDownloads.some((file) => file.id === id)
  const files = visibleHistory
    .filter((file) =>
      search
        ? `${file.folderPath ?? ''}/${displayFileName(file)}`.toLowerCase().includes(search.toLowerCase())
        : (file.folderPath ?? '') === folder
    )
    .sort((a, b) => b.uploadedAt - a.uploadedAt)
  const children = allFolders.filter(
    (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '') === folder
  )
  const choose = (file: DatasetPiece) => {
    setSelectedId(file.id)
    setDeleteConsent(false)
    clearDeletionError()
    setError('')
  }
  const act = async (action: () => Promise<void>) => {
    if (disabled) return
    setIsEditing(true)
    setError('')
    clearDeletionError()
    setNotice('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'File operation failed')
    } finally {
      setIsEditing(false)
    }
  }
  const downloadBlocked = (file: DatasetPiece) =>
    !isQueued(file.id) &&
    (isEditing ||
      deletingPieceCid === file.pieceCid ||
      download?.id === file.id ||
      !synapse ||
      !file.cid ||
      isDeletionScheduled(file))
  const downloadOriginal = (file: DatasetPiece) => {
    if (downloadBlocked(file)) return
    if (isQueued(file.id)) {
      cancelQueuedDownload(file.id)
      return
    }
    setError('')
    clearDeletionError()
    setNotice('')
    enqueueDownload(file)
  }
  const deleteSelectedFile = async () => {
    if (!selected || disabled) return
    setError('')
    clearDeletionError()
    setNotice('')
    if (!(await deleteFile(selected))) return
    setDeleteConsent(false)
    setSelectedId(null)
    setNotice('Removed from the file list. Storage providers will process removal in a subsequent proving period.')
  }

  return (
    <section className="drive-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
          <h2 className="flex items-center gap-2.5 text-base font-semibold">
            Files{' '}
            <span className="rounded-md bg-surface-raised px-2 py-0.5 text-xs font-normal tabular-nums text-muted">
              {visibleHistory.length}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="w-auto"
            disabled={isLoading || isEditing}
            onClick={() => refreshHistory()}
            size="sm"
            variant="secondary"
          >
            {isLoading && <Loader2 aria-hidden="true" className="animate-spin" size={14} />}
            Refresh files
          </Button>
          {onUpload && (
            <Button
              aria-label="Upload files"
              className="w-auto"
              disabled={isEditing || connection.busy || connection.uploading || uploadDisabled}
              onClick={onUpload}
              size="sm"
            >
              <Upload aria-hidden="true" size={14} />
              Upload
            </Button>
          )}
        </div>
      </div>
      {notice && (
        <p className="px-5 py-3 text-sm text-success" role="status">
          {notice}
        </p>
      )}
      {directoryError && (
        <p className="text-sm text-warning break-words" role="alert">
          {directoryError}
        </p>
      )}
      {download && (
        <div className="border-b border-border bg-canvas/30 px-5 py-3 text-sm sm:px-6">
          <p className="flex items-center gap-2" role="status">
            <Loader2 aria-hidden="true" className="shrink-0 animate-spin text-accent" size={16} />
            <span className="break-all">
              {download.stage} · {download.name}
            </span>
          </p>
          {queuedDownloads.length > 0 && (
            <details className="mt-2 text-xs text-muted">
              <summary className="w-fit cursor-pointer">
                {queuedDownloads.length} {queuedDownloads.length === 1 ? 'download' : 'downloads'} queued
              </summary>
              <ul aria-label="Queued downloads" className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {queuedDownloads.map((file) => (
                  <li className="flex items-center justify-between gap-3" key={file.id}>
                    <span className="min-w-0 truncate" title={file.name}>
                      {file.name}
                    </span>
                    <button
                      aria-label={`Cancel queued download for ${file.name}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded p-1 text-muted hover:text-foreground"
                      onClick={() => cancelQueuedDownload(file.id)}
                      type="button"
                    >
                      <X aria-hidden="true" size={14} /> Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {downloadError && (
        <p className="px-5 py-3 text-sm text-warning break-words" role="alert">
          {downloadError}
        </p>
      )}
      {(error || deletionError) && (
        <p className="text-sm text-warning break-words" role="alert">
          {error || deletionError}
        </p>
      )}
      <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label="File folders"
          className="space-y-1 border-b border-border bg-canvas/30 p-4 md:border-b-0 md:border-r md:p-5"
        >
          <p className="px-2 pb-3 text-[10px] font-medium tracking-[0.14em] text-muted">FOLDERS</p>
          <button
            aria-expanded={showFolders}
            className="mb-2 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm md:hidden"
            onClick={() => setShowFolders((value) => !value)}
            type="button"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Folder size={15} />
              <span className="truncate">{folder || 'Files'}</span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className={`transition-transform ${showFolders ? 'rotate-90' : ''}`}
              size={15}
            />
          </button>
          <div className={`${showFolders ? 'block' : 'hidden'} md:block`}>
            <button
              aria-current={folder === '' ? 'page' : undefined}
              aria-label="Files (root)"
              className={`flex w-full items-center gap-2.5 rounded-lg p-2.5 text-left text-sm transition-colors ${folder === '' ? 'bg-brand-800/15 text-accent' : 'text-muted hover:bg-surface-raised hover:text-foreground'}`}
              onClick={() => onFolderChange('')}
              type="button"
            >
              <ChevronDown aria-hidden="true" className="shrink-0" size={14} />
              <FolderOpen aria-hidden="true" className="shrink-0" size={16} />
              Files
            </button>
            <div className="ml-8 max-h-52 overflow-y-auto border-l border-border pl-2 md:max-h-80">
              {allFolders.map((path) => (
                <button
                  aria-current={folder === path ? 'page' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-lg py-2.5 pr-2 text-left text-sm transition-colors ${folder === path ? 'bg-brand-800/15 text-accent' : 'text-muted hover:bg-surface-raised hover:text-foreground'}`}
                  key={path}
                  onClick={() => onFolderChange(path)}
                  style={{ paddingLeft: `${12 + (path.split('/').length - 1) * 16}px` }}
                  title={path}
                  type="button"
                >
                  <Folder className="shrink-0" size={15} />
                  <span className="truncate">{path.split('/').at(-1)}</span>
                </button>
              ))}
            </div>
          </div>
        </nav>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <nav aria-label="Current folder" className="flex flex-wrap items-center gap-2 text-sm">
                <button className="text-muted hover:text-accent" onClick={() => onFolderChange('')} type="button">
                  Files
                </button>
                {folder
                  .split('/')
                  .filter(Boolean)
                  .map((part, index, parts) => (
                    <span className="flex gap-2" key={parts.slice(0, index + 1).join('/')}>
                      <ChevronRight aria-hidden="true" className="self-center text-muted" size={13} />
                      <button
                        className="hover:text-accent"
                        onClick={() => onFolderChange(parts.slice(0, index + 1).join('/'))}
                        type="button"
                      >
                        {part}
                      </button>
                    </span>
                  ))}
              </nav>
            </div>
            <div className="relative w-full sm:w-56">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                size={15}
              />
              <input
                aria-label="Search all files"
                className="drive-field h-9 w-full pl-9 pr-3 text-xs"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search all files"
                type="search"
                value={search}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className={`${files.length || children.length ? 'min-w-[760px]' : ''} w-full text-left text-sm`}>
              <thead className="bg-canvas/30 text-[11px] font-normal text-muted">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Size</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Copies</th>
                  <th className="p-4">Uploaded</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!search &&
                  children.map((path) => (
                    <tr className="border-t border-border" key={path}>
                      <td className="p-4" colSpan={6}>
                        <button
                          className="flex items-center gap-2 hover:underline"
                          onClick={() => onFolderChange(path)}
                          type="button"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-800/10 text-accent">
                            <Folder aria-hidden="true" size={16} />
                          </span>
                          {path.split('/').at(-1)}
                        </button>
                      </td>
                    </tr>
                  ))}
                {files.map((file) => (
                  <tr className="border-t border-border hover:bg-surface" key={file.id}>
                    <td className="p-4">
                      <button
                        className="flex items-center gap-2 text-left hover:underline"
                        onClick={() => choose(file)}
                        type="button"
                      >
                        <FileTypeIcon fileName={file.fileName} importedCar={file.importedCar} />
                        <span className="max-w-[260px] truncate">
                          {search && file.folderPath ? `${file.folderPath}/` : ''}
                          {displayFileName(file)}
                        </span>
                      </button>
                    </td>
                    <td className="p-4 whitespace-nowrap">{file.fileSize}</td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${deletingPieceCid === file.pieceCid || fileStatus(file) === 'Deletion incomplete' ? 'bg-amber-500/10 text-warning' : file.cid ? (file.ipfsIndexed === false ? 'bg-brand-800/15 text-accent' : 'bg-emerald-500/10 text-success') : 'bg-surface-raised text-muted'}`}
                        title={
                          file.ipfsIndexed === false && !file.deletion
                            ? (file.ipfsCheckAttempts ?? 0) >= IPFS_CHECK_LIMIT
                              ? 'Automatic checks stopped after 5 attempts. The file is stored and can still be downloaded.'
                              : `Checking IPFS indexing up to 5 times, every 2 minutes (${file.ipfsCheckAttempts ?? 0}/5 completed).`
                            : undefined
                        }
                      >
                        <span className="h-1 w-1 shrink-0 rounded-full bg-current" />
                        {displayStatus(file)}
                      </span>
                    </td>
                    <td className="p-4 tabular-nums text-muted">{file.copyCount ?? 1}</td>
                    <td className="p-4 whitespace-nowrap text-xs text-muted">
                      {file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'Unknown'}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-3">
                        <button
                          aria-label={
                            isQueued(file.id) ? `Cancel queued download for ${displayFileName(file)}` : undefined
                          }
                          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent disabled:opacity-40"
                          disabled={downloadBlocked(file)}
                          onClick={() => downloadOriginal(file)}
                          type="button"
                        >
                          {download?.id === file.id ? (
                            <Loader2 aria-hidden="true" className="animate-spin" size={14} />
                          ) : isQueued(file.id) ? (
                            <X aria-hidden="true" size={14} />
                          ) : (
                            <Download aria-hidden="true" size={14} />
                          )}
                          {download?.id === file.id
                            ? 'Downloading…'
                            : isQueued(file.id)
                              ? 'Queued · Cancel'
                              : 'Download'}
                        </button>
                        <ShareFileButton disabled={deletingPieceCid === file.pieceCid} file={file} />
                        <button
                          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent"
                          onClick={() => choose(file)}
                          type="button"
                        >
                          <MoreHorizontal aria-hidden="true" size={14} />
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {files.length === 0 && (search || children.length === 0) && (
                  <tr>
                    <td className="px-5 py-16 text-center text-muted" colSpan={6}>
                      <span
                        aria-hidden="true"
                        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-canvas/40 text-accent"
                      >
                        <FolderOpen size={24} />
                      </span>
                      <p className="mb-2 text-sm font-medium text-foreground">
                        {isLoading
                          ? 'Loading file index…'
                          : directoryError && !visibleHistory.length
                            ? 'File index unavailable'
                            : search
                              ? 'No matching files.'
                              : 'A little space for something new'}
                      </p>
                      <p className="text-xs">
                        {isLoading
                          ? 'Your cached files are kept while the index refreshes.'
                          : directoryError && !visibleHistory.length
                            ? 'Use Refresh files to retry.'
                            : search
                              ? 'Try a different file name or folder.'
                              : 'No files here yet. Upload to this folder.'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <Dialog.Root
        onOpenChange={(open) => {
          if (!open && !isEditing) setSelectedId(null)
        }}
        open={Boolean(selected)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
          <Dialog.Content
            className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-6 space-y-6"
            onEscapeKeyDown={(event) => {
              if (isEditing) event.preventDefault()
            }}
            onPointerDownOutside={(event) => {
              if (isEditing) event.preventDefault()
            }}
          >
            <Dialog.Title className="pr-10 text-xl font-semibold break-all">
              {selected ? displayFileName(selected) : ''}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted">
              File details and storage copies on{' '}
              {connection.network === 'mainnet' ? 'Filecoin Mainnet' : 'Calibration Testnet'}.
            </Dialog.Description>
            <Dialog.Close
              aria-label="Close details"
              className="absolute right-5 top-5 rounded p-2 hover:bg-surface-raised"
              disabled={isEditing}
            >
              <X size={20} />
            </Dialog.Close>
            {selected && (
              <>
                <div className="text-sm space-y-2">
                  <p>
                    {selected.fileSize} · {displayStatus(selected)}
                  </p>
                  {selected.ipfsIndexed === false &&
                    !selected.deletion &&
                    (selected.ipfsCheckAttempts ?? 0) >= IPFS_CHECK_LIMIT && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-muted">
                          Automatic indexing checks stopped after 5 attempts. Your stored file can still be downloaded.
                        </p>
                        <Button
                          disabled={disabled || !storageScope}
                          onClick={() =>
                            void act(async () => {
                              await resetIndexingChecks(storageScope ?? '', selected.cid)
                              await updateUpload(selected.id, { ipfsCheckAttempts: 0 })
                            })
                          }
                          size="sm"
                          variant="secondary"
                        >
                          Retry indexing checks
                        </Button>
                      </div>
                    )}
                  <p>
                    {selected.id.startsWith('indexed-') ? 'Storage confirmed' : 'Uploaded'}{' '}
                    {selected.uploadedAt ? new Date(selected.uploadedAt).toLocaleString() : 'Unknown'}
                  </p>
                  <p className="break-all">Wallet {connection.address}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      aria-label={
                        download?.id === selected.id
                          ? 'Downloading…'
                          : isQueued(selected.id)
                            ? 'Cancel queued download'
                            : 'Download original file'
                      }
                      disabled={downloadBlocked(selected)}
                      onClick={() => downloadOriginal(selected)}
                      size="sm"
                      variant={isQueued(selected.id) ? 'secondary' : 'primary'}
                    >
                      {download?.id === selected.id ? (
                        <Loader2 aria-hidden="true" className="animate-spin" size={14} />
                      ) : isQueued(selected.id) ? (
                        <X aria-hidden="true" size={14} />
                      ) : (
                        <Download aria-hidden="true" size={14} />
                      )}
                      {download?.id === selected.id
                        ? 'Downloading…'
                        : isQueued(selected.id)
                          ? 'Queued · Cancel'
                          : 'Download'}
                    </Button>
                    {canPreviewFile(selected) && fileStatus(selected) !== 'Deletion scheduled' ? (
                      <a
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                        href={getIpfsGatewayPreviewLink(selected.cid, displayFileName(selected))}
                        rel="noopener noreferrer"
                        target="_blank"
                        title="Open via IPFS gateway in a new tab. Media support depends on your browser and file encoding."
                      >
                        <Eye aria-hidden="true" size={14} />
                        Preview
                      </a>
                    ) : (
                      <Button
                        disabled
                        size="sm"
                        title="Preview is unavailable for this file type or storage state."
                        variant="secondary"
                      >
                        <Eye aria-hidden="true" size={14} />
                        Preview
                      </Button>
                    )}
                  </div>
                  {download?.id === selected.id && (
                    <p className="text-sm text-muted" role="status">
                      {download.stage}
                    </p>
                  )}
                </div>
                <section className="space-y-3">
                  <h3 className="font-medium">Content identifiers</h3>
                  {selected.importedCar && (
                    <p className="text-xs text-muted">
                      Imported CAR archive. Download preserves the original archive; the first root is shown below.
                    </p>
                  )}
                  {[
                    ['IPFS root CID', selected.cid],
                    ['Piece CID', selected.pieceCid],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <label className="text-sm text-muted" htmlFor={label.replaceAll(' ', '-')}>
                        {label}
                      </label>
                      <input
                        className="mt-1 w-full rounded border border-border p-2 font-mono text-xs"
                        id={label.replaceAll(' ', '-')}
                        readOnly
                        value={value || 'Missing from this browser directory'}
                      />
                      {value && <CopyButton className="mt-1" label={`Copy ${label}`} value={value} />}
                    </div>
                  ))}
                  {selected.cid && !selected.importedCar && (
                    <a
                      className="block text-sm underline"
                      href={fileGatewayLink(selected)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Download through IPFS gateway
                    </a>
                  )}
                  {selected.pieceCid && (
                    <a
                      className="block text-sm underline"
                      href={getPieceExplorerLink(selected.pieceCid, selected.network)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      View piece on explorer
                    </a>
                  )}
                </section>
                <section className="space-y-3">
                  <h3 className="font-medium">Storage copies</h3>
                  {(selected.datasetIds ?? [selected.datasetId]).map((datasetId, index) => (
                    <div className="rounded-lg border border-border p-3 text-sm space-y-2" key={datasetId}>
                      <p>{selected.providerNames?.[index] || selected.providerName || 'Storage provider'}</p>
                      <div className="flex flex-wrap gap-3">
                        <a
                          className="underline"
                          href={getDatasetExplorerLink(datasetId, selected.network)}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Dataset {datasetId}
                        </a>
                        {(selected.providerIds?.[index] || selected.providerId) && (
                          <ProviderLink
                            network={selected.network === 'mainnet' ? 'mainnet' : 'calibration'}
                            providerId={selected.providerIds?.[index] ?? selected.providerId}
                          />
                        )}
                        {(selected.transactionHashes?.[index] || selected.transactionHash) && (
                          <a
                            className="underline"
                            href={getTxExplorerLink(
                              selected.transactionHashes?.[index] ?? selected.transactionHash,
                              selected.network
                            )}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Upload transaction
                          </a>
                        )}
                        {selected.removedCopies?.includes(datasetId) ? (
                          <span className="text-muted">Removed</span>
                        ) : selected.removalQueuedCopies?.includes(datasetId) ? (
                          <span className="text-warning">Removal scheduled</span>
                        ) : null}
                        {selected.deletion?.[datasetId] && (
                          <a
                            className="underline"
                            href={getTxExplorerLink(selected.deletion[datasetId].transactionHash, selected.network)}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Deletion{' '}
                            {selected.deletion[datasetId].confirmed
                              ? selected.deletion[datasetId].remaining
                                ? 'batch scheduled · more remain'
                                : 'scheduled'
                              : 'pending'}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </section>
                <section className="space-y-3 border-t border-border pt-5">
                  <h3 className="flex items-center gap-2 font-medium">
                    <Trash2 aria-hidden="true" className="text-danger" size={16} />
                    Delete from Filecoin
                  </h3>
                  <p className="text-sm text-muted">
                    Delete this file and its stored copies. Removal may take some time.
                  </p>
                  <details className="text-xs text-muted">
                    <summary className="w-fit cursor-pointer hover:text-foreground">How deletion works</summary>
                    <p className="mt-2 leading-relaxed">
                      Storage providers remove copies during their next proving period. Cached copies may remain
                      accessible through IPFS. Deleting files does not close your storage datasets or immediately stop
                      all charges. Large deletions may require you to continue once the provider’s queue has space.
                    </p>
                  </details>
                  {affectedAliases.length > 1 && (
                    <div className="text-sm text-warning">
                      <p>These files contain identical content. Deletion affects all listed records:</p>
                      <ul className="mt-2 list-disc pl-5">
                        {affectedAliases.map((file) => (
                          <li className="break-words" key={file.id}>
                            {[file.folderPath, displayFileName(file)].filter(Boolean).join('/')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      checked={deleteConsent}
                      disabled={disabled}
                      onChange={(event) => setDeleteConsent(event.target.checked)}
                      type="checkbox"
                    />
                    Delete all recorded copies of this content.
                  </label>
                  <Button
                    disabled={disabled || !deleteConsent || !connection.session || allAliasesScheduled}
                    onClick={() => void deleteSelectedFile()}
                    size="sm"
                    variant="danger"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                    {working && !download
                      ? 'Processing…'
                      : hasDeletionProgress
                        ? 'Continue deletion'
                        : 'Schedule deletion'}
                  </Button>
                  {!connection.session && (
                    <p className="text-sm text-muted">Authorize a browser session in Wallet setup first.</p>
                  )}
                </section>
                {(error || deletionError) && (
                  <p className="text-sm text-warning break-words" role="alert">
                    {error || deletionError}
                  </p>
                )}
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
