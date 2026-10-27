import * as Dialog from '@radix-ui/react-dialog'
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  File as FileIcon,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useUploadHistory } from '../../context/upload-history-context.tsx'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { useDownloadQueue } from '../../hooks/use-download-queue.ts'
import { useFileDeletion } from '../../hooks/use-file-deletion.ts'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { IPFS_CHECK_LIMIT, resetIndexingChecks } from '../../hooks/use-ipfs-indexing.ts'
import { saveBlob } from '../../lib/filecoin-pin/download.ts'
import { addStoredDataSetId } from '../../lib/local-storage/data-set.ts'
import {
  deleteEmptyFolder,
  directoryFolders,
  normalizeFolder,
  parseDirectoryBackup,
  readFolders,
  saveFolders,
  subscribeFolders,
} from '../../lib/local-storage/drive-directory.ts'
import { isDeletionScheduled } from '../../utils/file-deletion.ts'
import {
  getDatasetExplorerLink,
  getIpfsGatewayDownloadLink,
  getIpfsGatewayPreviewLink,
  getPieceExplorerLink,
  getTxExplorerLink,
} from '../../utils/links.ts'
import { ButtonBase as Button, buttonVariants } from '../ui/button/button-base.tsx'
import { CopyButton } from '../ui/copy-button.tsx'
import { Select } from '../ui/select.tsx'
import { ProviderLink } from './provider-link.tsx'

export function fileStatus(file: DatasetPiece) {
  if (isDeletionScheduled(file)) return 'Deletion scheduled'
  if (file.deletion) return 'Deletion incomplete'
  if (!file.cid) return 'Metadata missing'
  if (file.ipfsIndexed === false)
    return (file.ipfsCheckAttempts ?? 0) >= IPFS_CHECK_LIMIT
      ? 'Stored · IPFS indexing unconfirmed'
      : 'Stored · IPFS indexing pending'
  return 'Stored'
}

// Formats browsers commonly display inline; media playback also depends on codecs.
const canPreview = (name: string) =>
  /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp|pdf|txt|json|html?|mp3|wav|ogg|mp4|webm)$/i.test(name)

interface Props {
  folder: string
  onFolderChange: (folder: string) => void
  onUpload?: () => void
  uploadDisabled?: boolean
}
export function FileBrowser({ folder, onFolderChange, onUpload, uploadDisabled = false }: Props) {
  const { history, updateUpload, mutateHistory, getLatestHistory, error: directoryError } = useUploadHistory()
  const { synapse, storageScope, addDataSetId } = useFilecoinPinContext()
  const connection = useBrowserWallet()
  const [folders, setFolders] = useState(() => readFolders(storageScope ?? ''))
  useEffect(() => {
    if (!storageScope) return
    const sync = () => setFolders(readFolders(storageScope))
    const unsubscribe = subscribeFolders(storageScope, sync)
    sync()
    return unsubscribe
  }, [storageScope])
  const [search, setSearch] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [rename, setRename] = useState('')
  const originalDirectory = useRef({ fileName: '', folderPath: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const { deleteFile, isDeleting, deletionError, clearDeletionError } = useFileDeletion()
  const working = isEditing || isDeleting
  const { download, queuedDownloads, downloadError, enqueueDownload, cancelQueuedDownload } = useDownloadQueue(
    synapse,
    storageScope
  )
  const [deleteConsent, setDeleteConsent] = useState(false)
  const [showFolders, setShowFolders] = useState(false)
  const visibleHistory = history.filter((file) => !isDeletionScheduled(file))
  const allFolders = directoryFolders(visibleHistory, folders)
  const folderHasContents =
    folderToDelete !== null &&
    (visibleHistory.some((file) => (file.folderPath ?? '') === folderToDelete) ||
      allFolders.some((path) => path.startsWith(`${folderToDelete}/`)))
  const selected = history.find((file) => file.id === selectedId)
  const selectedAliases = selected ? history.filter((file) => file.pieceCid === selected.pieceCid) : []
  const allAliasesScheduled =
    selectedAliases.length > 0 && selectedAliases.every((file) => fileStatus(file) === 'Deletion scheduled')
  const affectedAliases = selectedAliases.filter((file) => !isDeletionScheduled(file))
  const hasDeletionProgress = affectedAliases.some((file) => file.deletion !== undefined)
  const disabled = working || Boolean(download) || connection.busy || connection.uploading
  const isQueued = (id: string) => queuedDownloads.some((file) => file.id === id)
  const files = visibleHistory
    .filter((file) =>
      search
        ? `${file.folderPath ?? ''}/${file.fileName}`.toLowerCase().includes(search.toLowerCase())
        : (file.folderPath ?? '') === folder
    )
    .sort((a, b) => b.uploadedAt - a.uploadedAt)
  const children = allFolders.filter(
    (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '') === folder
  )
  const choose = (file: DatasetPiece) => {
    setSelectedId(file.id)
    setMoveTo(file.folderPath ?? '')
    setRename(file.fileName)
    originalDirectory.current = { fileName: file.fileName, folderPath: file.folderPath ?? '' }
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
  const downloadOriginal = (file: DatasetPiece) => {
    if (working) return
    if (isQueued(file.id)) {
      cancelQueuedDownload(file.id)
      return
    }
    setError('')
    clearDeletionError()
    setNotice('')
    enqueueDownload(file)
  }
  const createFolder = () =>
    act(async () => {
      if (!newFolder.trim()) return
      const path = normalizeFolder([folder, newFolder.trim()].filter(Boolean).join('/'))
      await saveFolders(storageScope ?? '', [path])
      setNewFolder('')
      onFolderChange(path)
    })
  const removeFolder = () =>
    act(async () => {
      if (!folderToDelete || !storageScope) return
      const path = folderToDelete
      await deleteEmptyFolder(storageScope, path)
      setFolderToDelete(null)
      if (folder === path) onFolderChange(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
      setNotice('Folder removed from this browser.')
    })
  const exportDirectory = () => {
    const files = getLatestHistory()
    const folders = directoryFolders(files, readFolders(storageScope ?? ''))
    const blob = new Blob([JSON.stringify({ version: 1, scope: storageScope, files, folders }, null, 2)], {
      type: 'application/json',
    })
    saveBlob(blob, `filecoin-directory-${connection.network}-${connection.address}.json`)
  }
  const saveDirectoryChanges = () =>
    act(async () => {
      if (!selected) return
      // Submit only edited fields so a rename cannot revert another tab's folder move.
      await updateUpload(selected.id, {
        ...(rename.trim() === originalDirectory.current.fileName ? {} : { fileName: rename.trim() }),
        ...(moveTo === originalDirectory.current.folderPath ? {} : { folderPath: moveTo }),
      })
      const saved = getLatestHistory().find((file) => file.id === selected.id)
      if (saved) {
        originalDirectory.current = { fileName: saved.fileName, folderPath: saved.folderPath ?? '' }
        setRename(saved.fileName)
        setMoveTo(saved.folderPath ?? '')
      }
    })
  const importDirectory = async (file: File) => {
    if (file.size > 10_000_000) throw new Error('Directory backups must be smaller than 10 MB')
    const parsed = parseDirectoryBackup(await file.text(), storageScope ?? '', connection.network)
    for (const record of parsed.files)
      for (const id of record.datasetIds ?? [record.datasetId]) {
        addStoredDataSetId(storageScope ?? '', Number(id))
        addDataSetId(BigInt(id))
      }
    await mutateHistory((current) => {
      const byId = new Map(current.map((record) => [record.id, record]))
      for (const record of parsed.files) if (!byId.has(record.id)) byId.set(record.id, record)
      return [...byId.values()]
    })
    await saveFolders(storageScope ?? '', parsed.folders)
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
        <h2 className="flex items-center gap-2.5 text-base font-semibold">
          Files{' '}
          <span className="rounded-md bg-surface-raised px-2 py-0.5 text-xs font-normal tabular-nums text-muted">
            {visibleHistory.length}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {onUpload && (
            <Button
              aria-label="Upload files"
              className="w-auto"
              disabled={working || connection.busy || connection.uploading || uploadDisabled}
              onClick={onUpload}
              size="sm"
            >
              <Upload aria-hidden="true" size={14} />
              Upload
            </Button>
          )}
          <Button
            aria-label="Export directory"
            className="w-auto"
            disabled={disabled}
            onClick={exportDirectory}
            size="sm"
            title="Export directory backup"
            variant="secondary"
          >
            <Download aria-hidden="true" size={14} />
            <span className="hidden sm:inline">Export directory</span>
          </Button>
          <label
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-surface-raised ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
            title="Import directory backup"
          >
            <Upload aria-hidden="true" size={14} />
            <span className="hidden sm:inline">Import directory</span>
            <input
              accept=".json,application/json"
              aria-label="Import directory"
              className="sr-only"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void act(() => importDirectory(file))
                event.target.value = ''
              }}
              type="file"
            />
          </label>
        </div>
      </div>
      <p className="border-b border-border bg-canvas/30 px-5 py-3 text-xs leading-5 text-muted sm:px-6">
        Folder structure and later name changes are saved only in this browser. Export a backup to transfer your
        directory.
      </p>
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
            <form
              className="pt-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                createFolder()
              }}
            >
              <input
                aria-label="New folder name"
                className="drive-field h-10 w-full px-3 text-xs"
                disabled={disabled}
                onChange={(event) => setNewFolder(event.target.value)}
                placeholder="New folder name"
                value={newFolder}
              />
              <Button disabled={disabled || !newFolder.trim()} size="sm" type="submit" variant="secondary">
                <FolderPlus aria-hidden="true" size={14} />
                Create folder
              </Button>
            </form>
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
              {folder && (
                <Button
                  className="w-auto"
                  disabled={disabled || !storageScope}
                  onClick={() => {
                    setError('')
                    clearDeletionError()
                    setFolderToDelete(folder)
                  }}
                  size="sm"
                  variant="secondary"
                >
                  <Trash2 aria-hidden="true" size={14} />
                  Delete folder
                </Button>
              )}
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
                          <Folder size={17} />
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
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-800/10 text-accent">
                          <FileIcon size={16} />
                        </span>
                        <span className="max-w-[260px] truncate">
                          {search && file.folderPath ? `${file.folderPath}/` : ''}
                          {file.fileName}
                        </span>
                      </button>
                    </td>
                    <td className="p-4 whitespace-nowrap">{file.fileSize}</td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${file.deletion ? 'bg-amber-500/10 text-warning' : file.cid ? (file.ipfsIndexed === false ? 'bg-brand-800/15 text-accent' : 'bg-emerald-500/10 text-success') : 'bg-surface-raised text-muted'}`}
                        title={
                          file.ipfsIndexed === false && !file.deletion
                            ? (file.ipfsCheckAttempts ?? 0) >= IPFS_CHECK_LIMIT
                              ? 'Automatic checks stopped after 5 attempts. The file is stored and can still be downloaded.'
                              : `Checking IPFS indexing up to 5 times, every 2 minutes (${file.ipfsCheckAttempts ?? 0}/5 completed).`
                            : undefined
                        }
                      >
                        <span className="h-1 w-1 shrink-0 rounded-full bg-current" />
                        {fileStatus(file)}
                      </span>
                    </td>
                    <td className="p-4 tabular-nums text-muted">{file.copyCount ?? 1}</td>
                    <td className="p-4 whitespace-nowrap text-xs text-muted">
                      {new Date(file.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-3">
                        <button
                          aria-label={isQueued(file.id) ? `Cancel queued download for ${file.fileName}` : undefined}
                          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent disabled:opacity-40"
                          disabled={
                            working || download?.id === file.id || !synapse || !file.cid || isDeletionScheduled(file)
                          }
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
                        {search ? 'No matching files.' : 'A little space for something new'}
                      </p>
                      <p className="text-xs">
                        {search ? 'Try a different file name or folder.' : 'No files here yet. Upload to this folder.'}
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
          if (!open && !working) setFolderToDelete(null)
        }}
        open={folderToDelete !== null}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-xl"
            onEscapeKeyDown={(event) => {
              if (working) event.preventDefault()
            }}
            onPointerDownOutside={(event) => {
              if (working) event.preventDefault()
            }}
          >
            <Dialog.Title className="text-lg font-semibold">Delete folder?</Dialog.Title>
            <p className="mt-2 break-words text-sm font-medium">{folderToDelete}</p>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
              {folderHasContents
                ? 'This folder is not empty. Move its files and remove its subfolders first.'
                : 'Remove this empty folder from this browser’s directory. No files will be deleted from Filecoin.'}
            </Dialog.Description>
            {(error || deletionError) && (
              <p className="mt-3 text-sm text-warning" role="alert">
                {error || deletionError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <Button
                className="w-auto"
                disabled={working}
                onClick={() => setFolderToDelete(null)}
                size="sm"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                className="w-auto"
                disabled={disabled || folderHasContents || !storageScope}
                onClick={() => void removeFolder()}
                size="sm"
                variant="danger"
              >
                Delete folder
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        onOpenChange={(open) => {
          if (!open && !working) setSelectedId(null)
        }}
        open={Boolean(selected)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
          <Dialog.Content
            className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-6 space-y-6"
            onEscapeKeyDown={(event) => {
              if (working) event.preventDefault()
            }}
            onPointerDownOutside={(event) => {
              if (working) event.preventDefault()
            }}
          >
            <Dialog.Title className="pr-10 text-xl font-semibold break-all">{selected?.fileName}</Dialog.Title>
            <Dialog.Description className="text-sm text-muted">
              File details and storage copies on{' '}
              {connection.network === 'mainnet' ? 'Filecoin Mainnet' : 'Calibration Testnet'}.
            </Dialog.Description>
            <Dialog.Close
              aria-label="Close details"
              className="absolute right-5 top-5 rounded p-2 hover:bg-surface-raised"
              disabled={working}
            >
              <X size={20} />
            </Dialog.Close>
            {selected && (
              <>
                <div className="text-sm space-y-2">
                  <p>
                    {selected.fileSize} · {fileStatus(selected)}
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
                  <p>Uploaded {new Date(selected.uploadedAt).toLocaleString()}</p>
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
                      disabled={
                        working ||
                        download?.id === selected.id ||
                        !synapse ||
                        !selected.cid ||
                        isDeletionScheduled(selected)
                      }
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
                    {selected.cid &&
                    !selected.importedCar &&
                    canPreview(selected.fileName) &&
                    fileStatus(selected) !== 'Deletion scheduled' ? (
                      <a
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                        href={getIpfsGatewayPreviewLink(selected.cid, selected.fileName)}
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
                  <h3 className="font-medium">Browser directory</h3>
                  <label className="block text-sm space-y-1">
                    <span>Display name</span>
                    <input
                      className="drive-field h-10 w-full px-3"
                      disabled={disabled}
                      onChange={(event) => setRename(event.target.value)}
                      value={rename}
                    />
                  </label>
                  <label className="block text-sm space-y-1" htmlFor="drive-file-folder">
                    <span>Folder</span>
                    <Select
                      aria-label="File folder"
                      containerClassName="w-full"
                      disabled={disabled}
                      id="drive-file-folder"
                      onChange={(event) => setMoveTo(event.target.value)}
                      value={moveTo}
                    >
                      <option value="">Files</option>
                      {allFolders.map((path) => (
                        <option key={path} value={path}>
                          {path}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button
                    disabled={disabled || !rename.trim()}
                    onClick={saveDirectoryChanges}
                    size="sm"
                    variant="secondary"
                  >
                    Save directory changes
                  </Button>
                </section>
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
                      href={getIpfsGatewayDownloadLink(selected.cid, selected.fileName)}
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
                    Schedules removal of every recorded copy at its provider’s next proving period. Content may remain
                    in IPFS caches. This does not terminate datasets or immediately stop every storage charge. Large
                    removals are saved in batches; continue after the provider releases its removal queue.
                  </p>
                  {affectedAliases.length > 1 && (
                    <div className="text-sm text-warning">
                      <p>These files contain identical content. Deletion affects all listed records:</p>
                      <ul className="mt-2 list-disc pl-5">
                        {affectedAliases.map((file) => (
                          <li className="break-words" key={file.id}>
                            {[file.folderPath, file.fileName].filter(Boolean).join('/')}
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
