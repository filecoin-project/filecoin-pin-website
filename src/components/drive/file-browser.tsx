import * as Dialog from '@radix-ui/react-dialog'
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Folder,
  FolderOpen,
  FolderUp,
  Loader2,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Fragment, type ReactNode, useState } from 'react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useUploadHistory } from '../../context/upload-history-context.tsx'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { useDownloadQueue } from '../../hooks/use-download-queue.ts'
import { useFileDeletion } from '../../hooks/use-file-deletion.ts'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { IPFS_CHECK_LIMIT, resetIndexingChecks } from '../../hooks/use-ipfs-indexing.ts'
import { displayFileName } from '../../lib/filecoin-pin/drive-api.ts'
import { canPreviewFile } from '../../lib/filecoin-pin/file-links.ts'
import { directoryFolders } from '../../lib/local-storage/drive-directory.ts'
import { hasRemovalProgress, isCopyRemovalScheduled, isDeletionScheduled } from '../../utils/file-deletion.ts'
import {
  getDatasetExplorerLink,
  getIpfsGatewayPreviewLink,
  getPieceExplorerLink,
  getTxExplorerLink,
} from '../../utils/links.ts'
import { copyProgress, fileStatus, fileStatusColors } from '../../utils/upload/file-status.ts'
import { ButtonBase as Button, buttonVariants } from '../ui/button/button-base.tsx'
import { CopyButton } from '../ui/copy-button.tsx'
import { DirectoryBrowser } from './directory-browser.tsx'
import { FileTypeIcon } from './file-type-icon.tsx'
import { FileUploadDetails } from './file-upload-details.tsx'
import { FolderInfo } from './folder-info.tsx'
import { ProviderLink } from './provider-link.tsx'
import { ShareFileButton } from './share-file-button.tsx'

export { fileStatus } from '../../utils/upload/file-status.ts'

interface Props {
  folder: string
  onFolderChange: (folder: string) => void
  onUpload?: (location: string) => void
  uploadDisabled?: boolean
}
export function FileBrowser({ folder, onFolderChange: setFolderPath, onUpload, uploadDisabled }: Props) {
  const {
    history,
    updateUpload,
    refreshHistory,
    isLoading,
    hasLoaded,
    indexError,
    error: saveError,
  } = useUploadHistory()
  const { synapse, storageScope } = useFilecoinPinContext()
  const connection = useBrowserWallet()
  const [search, setSearch] = useState('')
  const [sessionHintAttempt, setSessionHintAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [directoryId, setDirectoryId] = useState<string | null>(null)
  const openDirectory = (id: string) => {
    setShowFolders(false)
    setDirectoryId(id)
    setSearch('')
  }
  const onFolderChange = (path: string) => {
    setShowFolders(false)
    setSearch('')
    setDirectoryId(null)
    setFolderPath(path)
  }
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const { deleteFile, deletingPieceCids, autoCheckingPieceCids, deletionErrors } = useFileDeletion()
  const displayStatus = (file: DatasetPiece) => (deletingPieceCids.has(file.pieceCid) ? 'Deleting…' : fileStatus(file))
  const { download, queuedDownloads, downloadError, enqueueDownload, cancelQueuedDownload } = useDownloadQueue(
    synapse,
    storageScope
  )
  const [deleteConsent, setDeleteConsent] = useState(false)
  const [showFolders, setShowFolders] = useState(false)
  const directoryError = saveError ?? indexError
  const visibleHistory = history.filter((file) => !isDeletionScheduled(file))
  const waitingForIndex = isLoading || (!hasLoaded && !directoryError)
  const allFolders = directoryFolders(visibleHistory, [])
  const openedDirectory = visibleHistory.find((file) => file.id === directoryId && file.isDirectory)
  const uploadedFolders = visibleHistory.filter((file) => file.isDirectory)
  const renderFolderTree = (parent: string, depth: number): ReactNode => (
    <>
      {allFolders
        .filter((path) => path.split('/').slice(0, -1).join('/') === parent)
        .map((path) => (
          <Fragment key={path}>
            <button
              aria-current={!directoryId && folder === path ? 'page' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg py-2.5 pr-2 text-left text-sm transition-colors ${!directoryId && folder === path ? 'bg-brand-800/15 text-accent' : 'text-muted hover:bg-surface-raised hover:text-foreground'}`}
              onClick={() => onFolderChange(path)}
              style={{ paddingLeft: 12 + depth * 16 }}
              title={path}
              type="button"
            >
              <Folder aria-hidden="true" className="shrink-0" size={16} />
              <span className="truncate">{path.split('/').at(-1)}</span>
            </button>
            {renderFolderTree(path, depth + 1)}
          </Fragment>
        ))}
      {uploadedFolders
        .filter((file) => (file.folderPath ?? '') === parent)
        .map((file) => (
          <button
            aria-current={directoryId === file.id ? 'page' : undefined}
            className={`flex w-full items-center gap-2.5 rounded-lg py-2.5 pr-2 text-left text-sm transition-colors ${directoryId === file.id ? 'bg-brand-800/15 text-accent' : 'text-muted hover:bg-surface-raised hover:text-foreground'}`}
            disabled={!file.cid}
            key={file.id}
            onClick={() => openDirectory(file.id)}
            style={{ paddingLeft: 12 + depth * 16 }}
            title={[file.folderPath, displayFileName(file)].filter(Boolean).join('/')}
            type="button"
          >
            <FolderUp aria-hidden="true" className="shrink-0" size={16} />
            <span className="truncate">{displayFileName(file)}</span>
            {uploadedFolders.some(
              (other) => other.id !== file.id && other.fileName === file.fileName && (other.folderPath ?? '') === parent
            ) && (
              <span className="ml-auto shrink-0 text-[10px]">
                {file.uploadedAt ? new Date(file.uploadedAt).toLocaleTimeString() : 'Unknown'}
              </span>
            )}
          </button>
        ))}
    </>
  )
  const selected = history.find((file) => file.id === selectedId)
  const working = isEditing || Boolean(selected && deletingPieceCids.has(selected.pieceCid))
  const deletionError = selected
    ? (deletionErrors[selected.pieceCid] ?? '')
    : Object.entries(deletionErrors)
        .map(([cid, message]) => `${history.find((file) => file.pieceCid === cid)?.fileName ?? cid}: ${message}`)
        .join('\n')
  const selectedAliases = selected ? history.filter((file) => file.pieceCid === selected.pieceCid) : []
  const allAliasesScheduled =
    selectedAliases.length > 0 && selectedAliases.every((file) => fileStatus(file) === 'Deletion scheduled')
  const affectedAliases = selectedAliases.filter((file) => !isDeletionScheduled(file))
  const hasDeletionProgress = affectedAliases.some(hasRemovalProgress)
  const waitingForDeletion = Boolean(
    selected &&
      Object.entries(selected.deletion ?? {}).some(
        ([id, checkpoint]) => !checkpoint.confirmed && !isCopyRemovalScheduled(selected, id)
      )
  )
  const autoCheckingDeletion = Boolean(selected && autoCheckingPieceCids.has(selected.pieceCid))
  const disabled = working || autoCheckingDeletion || Boolean(download) || connection.busy
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
    setError('')
  }
  const act = async (action: () => Promise<void>) => {
    if (disabled) return
    setIsEditing(true)
    setError('')
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
      deletingPieceCids.has(file.pieceCid) ||
      download?.id === file.id ||
      !synapse ||
      !file.cid ||
      !file.pieceCid ||
      isDeletionScheduled(file))
  const downloadOriginal = (file: DatasetPiece) => {
    if (downloadBlocked(file)) return
    if (isQueued(file.id)) {
      cancelQueuedDownload(file.id)
      return
    }
    setError('')
    enqueueDownload(file)
  }
  const deleteSelectedFile = async () => {
    if (!selected || disabled) return
    setError('')
    if (!(await deleteFile(selected))) return
    setSelectedId((current) => (current === selected.id ? null : current))
  }

  return (
    <section className="drive-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
          <h2 className="flex items-center gap-2.5 text-base font-semibold">
            Files{' '}
            <span className="rounded-md bg-surface-raised px-2 py-0.5 text-xs font-normal tabular-nums text-muted">
              {!visibleHistory.length && (!hasLoaded || directoryError) ? '—' : visibleHistory.length}
            </span>
          </h2>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
          <label className="relative w-full md:w-64">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              size={15}
            />
            <span className="sr-only">{openedDirectory ? 'Search this folder' : 'Search file list'}</span>
            <input
              className="drive-field h-10 w-full pl-9 pr-3 text-xs"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={openedDirectory ? 'Search this folder' : 'Search file list'}
              type="search"
              value={search}
            />
          </label>
          <Button
            className="w-auto"
            disabled={isLoading || isEditing}
            onClick={() => refreshHistory()}
            size="sm"
            variant="secondary"
          >
            {isLoading && <Loader2 aria-hidden="true" className="animate-spin" size={14} />}
            Load from Filecoin
          </Button>
          {onUpload && (
            <Button
              aria-label="Upload files"
              className="w-auto"
              disabled={isEditing || connection.busy || (uploadDisabled ?? connection.uploading)}
              onClick={() => onUpload?.(openedDirectory ? '' : folder)}
              size="sm"
            >
              <Upload aria-hidden="true" size={14} />
              Upload
            </Button>
          )}
        </div>
      </div>
      {directoryError && (
        <p className="px-5 py-3 text-sm text-warning break-words sm:px-6" role="alert" title={directoryError}>
          {!saveError && indexError
            ? visibleHistory.length
              ? 'Unable to load the latest file list. Your existing list is still available.'
              : 'Unable to load your file list. Please try again.'
            : directoryError}
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
        <p className="px-5 py-3 text-sm text-warning break-words sm:px-6" role="alert">
          {error || deletionError}
        </p>
      )}
      <div className="drive-file-workspace grid grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[220px_minmax(0,1fr)] md:grid-rows-1">
        <nav
          aria-label="File folders"
          className="min-h-0 space-y-1 border-b border-border bg-canvas/30 p-4 md:border-b-0 md:border-r md:p-5"
        >
          <p className="flex items-center gap-1 px-2 pb-3 text-[10px] font-medium tracking-[0.14em] text-muted">
            FOLDERS <FolderInfo />
          </p>
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
          <div
            className={`${showFolders ? 'block' : 'hidden'} max-h-40 overflow-y-auto md:block md:max-h-none md:overflow-visible`}
          >
            <button
              aria-current={!directoryId && folder === '' ? 'page' : undefined}
              aria-label="Files (root)"
              className={`flex w-full items-center gap-2.5 rounded-lg p-2.5 text-left text-sm transition-colors ${!directoryId && folder === '' ? 'bg-brand-800/15 text-accent' : 'text-muted hover:bg-surface-raised hover:text-foreground'}`}
              onClick={() => onFolderChange('')}
              type="button"
            >
              <ChevronDown aria-hidden="true" className="shrink-0" size={14} />
              <FolderOpen aria-hidden="true" className="shrink-0" size={16} />
              Files
            </button>
            <div className="ml-8 max-h-52 overflow-y-auto border-l border-border pl-2 md:max-h-80">
              {renderFolderTree('', 0)}
            </div>
          </div>
        </nav>
        {openedDirectory ? (
          <DirectoryBrowser
            activeDownloadId={download?.id}
            downloadBlocked={downloadBlocked}
            file={openedDirectory}
            isQueued={isQueued}
            key={openedDirectory.id}
            onDownload={downloadOriginal}
            onFolderChange={onFolderChange}
            onSearchChange={setSearch}
            search={search}
          />
        ) : (
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
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
            </div>
            <section aria-label="Files list" className="drive-file-list" key={`${folder}:${search}`}>
              <table className={`${files.length || children.length ? 'min-w-[760px]' : ''} w-full text-left text-sm`}>
                <thead className="text-[11px] font-normal text-muted">
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
                        <td className="p-4 whitespace-nowrap" colSpan={6}>
                          <button
                            className="inline-flex items-center gap-2 align-middle text-left hover:underline"
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
                      <td className="p-4 whitespace-nowrap">
                        <button
                          aria-label={displayFileName(file)}
                          className="inline-flex items-center gap-2 align-middle text-left hover:underline"
                          onClick={() => (file.isDirectory && file.cid ? openDirectory(file.id) : choose(file))}
                          type="button"
                        >
                          {file.isDirectory ? (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-800/10 text-accent">
                              <FolderUp aria-hidden="true" size={16} />
                            </span>
                          ) : (
                            <FileTypeIcon fileName={file.fileName} importedCar={file.importedCar} />
                          )}
                          <span className="max-w-[260px] truncate">
                            {search && file.folderPath ? `${file.folderPath}/` : ''}
                            {displayFileName(file)}
                          </span>
                        </button>
                      </td>
                      <td className="p-4 whitespace-nowrap">{file.fileSize}</td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${fileStatusColors(displayStatus(file))}`}
                        >
                          <span className="h-1 w-1 shrink-0 rounded-full bg-current" />
                          {displayStatus(file)}
                        </span>
                      </td>
                      <td className="p-4 tabular-nums text-muted">
                        <span className="whitespace-nowrap">
                          {file.upload
                            ? `${file.copyCount ?? 0} / ${file.upload.expectedCopies} confirmed`
                            : (file.copyCount ?? 1)}
                        </span>
                        {copyProgress(file) && (
                          <span className="mt-1 block text-[11px] text-warning">{copyProgress(file)}</span>
                        )}
                      </td>
                      <td className="p-4 whitespace-nowrap text-xs text-muted">
                        {file.uploadedAt
                          ? file.isDirectory &&
                            uploadedFolders.some(
                              (other) =>
                                other.id !== file.id &&
                                other.fileName === file.fileName &&
                                other.folderPath === file.folderPath
                            )
                            ? new Date(file.uploadedAt).toLocaleString()
                            : new Date(file.uploadedAt).toLocaleDateString()
                          : 'Unknown'}
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
                                : file.isDirectory
                                  ? 'Download ZIP'
                                  : 'Download'}
                          </button>
                          <ShareFileButton
                            disabled={
                              deletingPieceCids.has(file.pieceCid) ||
                              Boolean(file.upload && file.upload.phase !== 'complete')
                            }
                            file={file}
                          />
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
                          {waitingForIndex
                            ? 'Loading files from Filecoin…'
                            : directoryError && !visibleHistory.length
                              ? 'Unable to load files from Filecoin'
                              : search
                                ? 'No matching files.'
                                : 'A little space for something new'}
                        </p>
                        <p className="text-xs">
                          {waitingForIndex
                            ? 'Checking the Filecoin index for your files.'
                            : directoryError && !visibleHistory.length
                              ? 'Your files may still be stored on Filecoin. Retry loading the file list.'
                              : search
                                ? 'Try a different file name or folder.'
                                : 'No files here yet. Upload to this folder.'}
                        </p>
                        {directoryError && !visibleHistory.length && !isLoading && (
                          <Button
                            className="mt-4 w-auto"
                            onClick={() => refreshHistory()}
                            size="sm"
                            variant="secondary"
                          >
                            Retry loading
                          </Button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>
        )}
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
                    {selected.fileSize}
                    {!selected.upload && ` · ${displayStatus(selected)}`}
                  </p>
                  {selected.ipfsIndexed === false &&
                    !selected.deletion &&
                    (!selected.upload || selected.upload.phase === 'complete') &&
                    (selected.ipfsCheckAttempts ?? 0) >= IPFS_CHECK_LIMIT && (
                      <details className="mt-2 space-y-2">
                        <summary className="cursor-pointer text-xs text-muted">IPFS indexing</summary>
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
                      </details>
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
                    {(selected.isDirectory || canPreviewFile(selected)) &&
                    (!selected.upload || selected.upload.phase === 'complete') &&
                    fileStatus(selected) !== 'Deletion scheduled' ? (
                      <a
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                        href={getIpfsGatewayPreviewLink(
                          selected.cid,
                          selected.isDirectory ? '' : displayFileName(selected)
                        )}
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
                        value={value || (selected.upload ? 'Not available yet' : 'Missing from this browser directory')}
                      />
                      {value && <CopyButton className="mt-1" label={`Copy ${label}`} value={value} />}
                    </div>
                  ))}
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
                <FileUploadDetails file={selected} />
                <section className="space-y-3">
                  <h3 className="font-medium">Storage copies</h3>
                  {(selected.datasetIds ?? [selected.datasetId]).map((datasetId, index) => {
                    const checkpoint = selected.deletion?.[datasetId]
                    const removalStatus = selected.removedCopies?.includes(datasetId)
                      ? 'Removed'
                      : isCopyRemovalScheduled(selected, datasetId)
                        ? 'Removal scheduled'
                        : checkpoint?.confirmed
                          ? 'More removals needed'
                          : checkpoint
                            ? 'Deletion pending'
                            : null
                    return (
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
                          {removalStatus &&
                            (checkpoint?.transactionHash ? (
                              <a
                                className="underline"
                                href={getTxExplorerLink(checkpoint.transactionHash, selected.network)}
                                rel="noopener noreferrer"
                                target="_blank"
                                title="View deletion transaction"
                              >
                                {removalStatus}
                              </a>
                            ) : (
                              <span className={removalStatus === 'Removed' ? 'text-muted' : 'text-warning'}>
                                {removalStatus}
                              </span>
                            ))}
                        </div>
                      </div>
                    )
                  })}
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
                    aria-describedby={connection.session ? undefined : 'delete-session-hint'}
                    aria-disabled={!connection.session || undefined}
                    className={connection.session ? undefined : 'opacity-50 cursor-not-allowed'}
                    disabled={
                      disabled ||
                      (Boolean(connection.session) && !deleteConsent) ||
                      allAliasesScheduled ||
                      Boolean(selected.upload && selected.upload.phase !== 'complete')
                    }
                    onClick={() => {
                      if (connection.session) {
                        void deleteSelectedFile()
                      } else {
                        setSessionHintAttempt((attempt) => attempt + 1)
                      }
                    }}
                    size="sm"
                    variant="danger"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                    {autoCheckingDeletion
                      ? 'Checking deletion status…'
                      : working && !download
                        ? 'Processing…'
                        : hasDeletionProgress
                          ? 'Continue deletion'
                          : 'Schedule deletion'}
                  </Button>
                  {selected.upload && selected.upload.phase !== 'complete' && (
                    <p className="text-sm text-muted">Wait for the upload to finish before deleting this content.</p>
                  )}
                  {waitingForDeletion && !working && (
                    <p className="text-sm text-muted" role="status">
                      Waiting for deletion confirmation.
                    </p>
                  )}
                  {!connection.session && (
                    <p
                      className={`rounded-md text-sm text-muted ${sessionHintAttempt ? 'animate-session-hint' : ''}`}
                      id="delete-session-hint"
                      key={sessionHintAttempt}
                      role={sessionHintAttempt ? 'alert' : undefined}
                    >
                      Authorize a browser session in Wallet setup first.
                    </p>
                  )}
                </section>
                {(error || deletionError) && (
                  <p className="px-5 py-3 text-sm text-warning break-words sm:px-6" role="alert">
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
