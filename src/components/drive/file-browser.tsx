import * as Dialog from '@radix-ui/react-dialog'
import {
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
import { useState } from 'react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useUploadHistory } from '../../context/upload-history-context.tsx'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { scheduleFileDeletion } from '../../lib/filecoin-pin/delete.ts'
import { downloadFile, saveBlob } from '../../lib/filecoin-pin/download.ts'
import { addStoredDataSetId } from '../../lib/local-storage/data-set.ts'
import {
  directoryFolders,
  normalizeFolder,
  parseDirectoryBackup,
  readFolders,
  saveFolders,
} from '../../lib/local-storage/drive-directory.ts'
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
  const copies = file.datasetIds ?? [file.datasetId]
  const deleted = copies.filter((id) => file.deletion?.[id]?.confirmed && !file.deletion[id].remaining).length
  if (deleted === copies.length) return 'Deletion scheduled'
  if (file.deletion && Object.keys(file.deletion).length) return 'Deletion incomplete'
  if (!file.cid) return 'Metadata missing'
  return file.ipfsIndexed === false ? 'Stored · IPFS indexing pending' : 'Stored'
}

// Formats browsers commonly display inline; media playback also depends on codecs.
const canPreview = (name: string) =>
  /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp|pdf|txt|json|html?|mp3|wav|ogg|mp4|webm)$/i.test(name)

interface Props {
  folder: string
  onFolderChange: (folder: string) => void
}
export function FileBrowser({ folder, onFolderChange }: Props) {
  const { history, updateUpload, replaceHistory, error: directoryError } = useUploadHistory()
  const { synapse, storageScope, ensurePermissions, addDataSetId } = useFilecoinPinContext()
  const connection = useBrowserWallet()
  const [folders, setFolders] = useState(() => readFolders(storageScope ?? ''))
  const [search, setSearch] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [rename, setRename] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [download, setDownload] = useState<{ id: string; name: string; stage: string } | null>(null)
  const [deleteConsent, setDeleteConsent] = useState(false)
  const [showFolders, setShowFolders] = useState(false)
  const allFolders = directoryFolders(history, folders)
  const selected = history.find((file) => file.id === selectedId)
  const selectedAliases = selected ? history.filter((file) => file.pieceCid === selected.pieceCid) : []
  const allAliasesScheduled =
    selectedAliases.length > 0 && selectedAliases.every((file) => fileStatus(file) === 'Deletion scheduled')
  const hasDeletionProgress = selectedAliases.some((file) => Object.keys(file.deletion ?? {}).length > 0)
  const disabled = working || connection.busy || connection.uploading
  const files = history
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
    setDeleteConsent(false)
    setError('')
  }
  const act = async (action: () => Promise<void>, chainOperation = false) => {
    if (disabled) return
    setWorking(true)
    setError('')
    if (chainOperation) connection.setUploading(true)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'File operation failed')
    } finally {
      setWorking(false)
      if (chainOperation) connection.setUploading(false)
    }
  }
  const downloadOriginal = (file: DatasetPiece) =>
    act(async () => {
      if (!synapse) return
      setDownload({ id: file.id, name: file.fileName, stage: 'Downloading from storage provider' })
      try {
        await downloadFile(synapse, file, (stage) =>
          setDownload({
            id: file.id,
            name: file.fileName,
            stage: stage === 'downloading' ? 'Downloading from storage provider' : 'Preparing original file',
          })
        )
      } finally {
        setDownload(null)
      }
    })
  const createFolder = () => {
    try {
      if (!newFolder.trim()) return
      const path = normalizeFolder([folder, newFolder.trim()].filter(Boolean).join('/'))
      const next = directoryFolders(history, [...folders, path])
      saveFolders(storageScope ?? '', next)
      setFolders(next)
      setNewFolder('')
      onFolderChange(path)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create folder')
    }
  }
  const exportDirectory = () => {
    const blob = new Blob(
      [JSON.stringify({ version: 1, scope: storageScope, files: history, folders: allFolders }, null, 2)],
      { type: 'application/json' }
    )
    saveBlob(blob, `filecoin-directory-${connection.network}-${connection.address}.json`)
  }
  const importDirectory = async (file: File) => {
    if (file.size > 10_000_000) throw new Error('Directory backups must be smaller than 10 MB')
    const parsed = parseDirectoryBackup(await file.text(), storageScope ?? '', connection.network)
    const byId = new Map(history.map((record) => [record.id, record]))
    for (const record of parsed.files) if (!byId.has(record.id)) byId.set(record.id, record)
    for (const record of parsed.files)
      for (const id of record.datasetIds ?? [record.datasetId]) {
        if (!Number.isSafeInteger(Number(id))) throw new Error('Dataset ID exceeds browser storage limits')
      }
    for (const record of parsed.files)
      for (const id of record.datasetIds ?? [record.datasetId]) {
        addStoredDataSetId(storageScope ?? '', Number(id))
        addDataSetId(BigInt(id))
      }
    const mergedFolders = directoryFolders([...byId.values()], [...folders, ...parsed.folders])
    saveFolders(storageScope ?? '', mergedFolders)
    setFolders(mergedFolders)
    replaceHistory([...byId.values()])
  }
  const deleteFile = async () => {
    if (!selected || !synapse || !ensurePermissions) return
    await ensurePermissions()
    // Identical uploads can share the same on-chain piece. Explain and track all affected records.
    const aliases = history.filter((file) => file.pieceCid === selected.pieceCid)
    const datasetIds = [...new Set(aliases.flatMap((file) => file.datasetIds ?? [file.datasetId]))]
    const deletion: NonNullable<DatasetPiece['deletion']> = {}
    for (const alias of aliases)
      for (const [id, checkpoint] of Object.entries(alias.deletion ?? {})) {
        // A stale alias must not overwrite a receipt already confirmed elsewhere.
        if (!deletion[id]?.confirmed || deletion[id].remaining) deletion[id] = checkpoint
      }
    for (const id of datasetIds) {
      const checkpoint = deletion[id]
      // A later upload of identical content can add another piece instance.
      // An older alias's confirmed receipt does not cover that new instance.
      if (
        checkpoint?.confirmed &&
        aliases.some((alias) => (alias.datasetIds ?? [alias.datasetId]).includes(id) && !alias.deletion?.[id])
      )
        deletion[id] = { ...checkpoint, remaining: true }
    }
    await scheduleFileDeletion(synapse, { ...selected, datasetIds, deletion }, (changed) => {
      replaceHistory(
        history.map((file) =>
          file.pieceCid === selected.pieceCid
            ? {
                ...file,
                deletion: Object.fromEntries(
                  Object.entries(changed.deletion ?? {}).filter(([id]) =>
                    (file.datasetIds ?? [file.datasetId]).includes(id)
                  )
                ),
              }
            : file
        )
      )
    })
    setDeleteConsent(false)
  }

  return (
    <section className="drive-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <h2 className="flex items-center gap-2.5 text-base font-semibold">
          Files{' '}
          <span className="rounded-md bg-surface-raised px-2 py-0.5 text-xs font-normal tabular-nums text-muted">
            {history.length}
          </span>
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button className="w-auto" disabled={disabled} onClick={exportDirectory} size="sm" variant="secondary">
            <Download aria-hidden="true" size={14} />
            Export directory
          </Button>
          <label
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-surface-raised ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
          >
            <Upload aria-hidden="true" size={14} />
            Import directory
            <input
              accept=".json,application/json"
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
        This browser keeps your file names and folders. Export a directory backup to restore them on another browser.
        Folder changes only affect this directory.
      </p>
      {directoryError && (
        <p className="text-sm text-warning break-words" role="alert">
          {directoryError}
        </p>
      )}
      {download && (
        <p
          className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3 text-sm text-foreground"
          role="status"
        >
          <Loader2 aria-hidden="true" className="shrink-0 animate-spin text-accent" size={16} />
          <span className="break-all">
            {download.stage} · {download.name}
          </span>
        </p>
      )}
      {error && (
        <p className="text-sm text-warning break-words" role="alert">
          {error}
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
              className={`flex w-full items-center gap-2.5 rounded-lg p-2.5 text-left text-sm transition-colors ${folder === '' ? 'bg-brand-800/15 text-accent' : 'text-muted hover:bg-surface-raised hover:text-foreground'}`}
              onClick={() => onFolderChange('')}
              type="button"
            >
              <FolderOpen size={16} />
              All files at root
            </button>
            <div className="max-h-52 overflow-y-auto md:max-h-80">
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
                          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent disabled:opacity-40"
                          disabled={disabled || !synapse || !file.cid || fileStatus(file) === 'Deletion scheduled'}
                          onClick={() => void downloadOriginal(file)}
                          type="button"
                        >
                          {download?.id === file.id ? (
                            <Loader2 aria-hidden="true" className="animate-spin" size={14} />
                          ) : (
                            <Download aria-hidden="true" size={14} />
                          )}
                          {download?.id === file.id ? 'Downloading…' : 'Download'}
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
                  <p>Uploaded {new Date(selected.uploadedAt).toLocaleString()}</p>
                  <p className="break-all">Wallet {connection.address}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      aria-label={download?.id === selected.id ? 'Downloading…' : 'Download original file'}
                      disabled={disabled || !synapse || !selected.cid || fileStatus(selected) === 'Deletion scheduled'}
                      onClick={() => void downloadOriginal(selected)}
                      size="sm"
                      variant="primary"
                    >
                      {download?.id === selected.id ? (
                        <Loader2 aria-hidden="true" className="animate-spin" size={14} />
                      ) : (
                        <Download aria-hidden="true" size={14} />
                      )}
                      {download?.id === selected.id ? 'Downloading…' : 'Download'}
                    </Button>
                    {selected.cid && canPreview(selected.fileName) && fileStatus(selected) !== 'Deletion scheduled' ? (
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
                    onClick={() => updateUpload({ ...selected, fileName: rename.trim(), folderPath: moveTo })}
                    size="sm"
                    variant="secondary"
                  >
                    Save directory changes
                  </Button>
                </section>
                <section className="space-y-3">
                  <h3 className="font-medium">Content identifiers</h3>
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
                  {selected.cid && (
                    <a
                      className="block text-sm underline"
                      href={getIpfsGatewayDownloadLink(selected.cid, selected.fileName)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Download through IPFS gateway
                    </a>
                  )}
                  {selected.pieceCid && (
                    <a
                      className="block text-sm underline"
                      href={getPieceExplorerLink(selected.pieceCid, selected.network)}
                      rel="noreferrer"
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
                          rel="noreferrer"
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
                            rel="noreferrer"
                            target="_blank"
                          >
                            Upload transaction
                          </a>
                        )}
                        {selected.deletion?.[datasetId] && (
                          <a
                            className="underline"
                            href={getTxExplorerLink(selected.deletion[datasetId].transactionHash, selected.network)}
                            rel="noreferrer"
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
                  {selectedAliases.length > 1 && (
                    <div className="text-sm text-warning">
                      <p>These files contain identical content. Deletion affects all listed records:</p>
                      <ul className="mt-2 list-disc pl-5">
                        {selectedAliases.map((file) => (
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
                    onClick={() => void act(deleteFile, true)}
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
                {error && (
                  <p className="text-sm text-warning break-words" role="alert">
                    {error}
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
