import { ArrowLeft, ChevronRight, Download, Eye, Folder, FolderUp, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { DIRECTORY_PAGE_SIZE, type DirectoryItem, listDirectory } from '../../lib/filecoin-pin/directory.ts'
import { displayFileName } from '../../lib/filecoin-pin/drive-api.ts'
import { canPreviewFile } from '../../lib/filecoin-pin/file-links.ts'
import { type ContentReader, contentReader } from '../../lib/filecoin-pin/ipfs-content.ts'
import { formatFileSize } from '../../utils/format-file-size.ts'
import { getIpfsGatewayPreviewLink } from '../../utils/links.ts'
import { fileStatus } from '../../utils/upload/file-status.ts'
import { ButtonBase as Button } from '../ui/button/button-base.tsx'
import { FileTypeIcon } from './file-type-icon.tsx'
import { ShareFileButton } from './share-file-button.tsx'

type Props = {
  file: DatasetPiece
  onBack: () => void
  onDownload: (file: DatasetPiece) => void
  downloadBlocked: (file: DatasetPiece) => boolean
  isQueued: (id: string) => boolean
  activeDownloadId?: string
}

export function DirectoryBrowser({ file, onBack, onDownload, downloadBlocked, isQueued, activeDownloadId }: Props) {
  const [path, setPath] = useState('')
  const [offset, setOffset] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState<{ items: DirectoryItem[]; hasMore: boolean; cid: string } | null>(null)
  const [error, setError] = useState('')
  const sources = JSON.stringify({
    cid: file.cid,
    serviceURL: file.serviceURL,
    serviceURLs: file.serviceURLs,
    upload: file.upload ? { providers: file.upload.providers } : undefined,
  })
  const [session, setSession] = useState<{ controller: AbortController; reader: ContentReader } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setSession({ controller, reader: contentReader(JSON.parse(sources), controller.signal) })
    return () => controller.abort()
  }, [sources])
  useEffect(() => {
    if (!session) return
    let current = true
    setPage(null)
    setError('')
    void attempt
    void listDirectory(session.reader, path, offset, session.controller.signal)
      .then((result) => {
        if (current) setPage(result)
      })
      .catch((cause) => {
        if (current && !session.controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Unable to load folder.')
      })
    return () => {
      current = false
    }
  }, [path, offset, attempt, session])
  const navigate = (next: string) => {
    setPath(next)
    setOffset(0)
  }
  const selection = (item: DirectoryItem): DatasetPiece => ({
    ...file,
    id: `${file.id}:${item.path}`,
    fileName: item.name,
    cid: item.cid,
    isDirectory: item.isDirectory,
    fileSize: item.size === undefined ? '—' : formatFileSize(item.size),
    directoryEntry: { rootCid: file.cid, path: item.path },
  })
  const currentFolder =
    path && page ? selection({ name: path.split('/').at(-1) ?? '', path, cid: page.cid, isDirectory: true }) : file
  return (
    <div className="min-w-0">
      <div className="space-y-3 border-b border-border px-5 py-4">
        <button
          className="inline-flex items-center gap-2 text-xs text-muted hover:text-accent"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft size={14} /> Back to files
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <FolderUp className="text-accent" size={18} />
          <button className="text-sm font-medium hover:underline" onClick={() => navigate('')} type="button">
            {displayFileName(file)}
          </button>
          {path
            .split('/')
            .filter(Boolean)
            .map((name, i, parts) => (
              <span className="inline-flex items-center gap-2 text-sm" key={parts.slice(0, i + 1).join('/')}>
                <ChevronRight className="text-muted" size={13} />
                <button onClick={() => navigate(parts.slice(0, i + 1).join('/'))} type="button">
                  {name}
                </button>
              </span>
            ))}
        </div>
        <p className="text-xs text-muted">
          {fileStatus(file)} · {file.copyCount ?? 0} confirmed copies · Uploaded with folder:{' '}
          {file.uploadedAt ? new Date(file.uploadedAt).toLocaleString() : 'Unknown'}
        </p>
        <p className="text-xs text-muted">
          Files in this upload are stored together. To remove their storage, delete the uploaded folder from its
          details.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="w-auto"
            disabled={(Boolean(path) && !page) || downloadBlocked(currentFolder)}
            onClick={() => onDownload(currentFolder)}
            size="sm"
            variant="secondary"
          >
            <Download size={14} />
            {isQueued(currentFolder.id)
              ? 'Cancel queued ZIP'
              : activeDownloadId === currentFolder.id
                ? 'Downloading…'
                : 'Download ZIP'}
          </Button>
          <ShareFileButton disabled={Boolean(path) && !page} file={currentFolder} />
        </div>
      </div>
      {!page && !error && (
        <p className="flex items-center gap-2 p-6 text-sm text-muted" role="status">
          <Loader2 className="animate-spin" size={16} /> Loading folder…
        </p>
      )}
      {error && (
        <div className="space-y-3 p-6">
          <p className="text-sm text-warning" role="alert">
            {error}
          </p>
          <Button className="w-auto" onClick={() => setAttempt((value) => value + 1)} size="sm" variant="secondary">
            Retry loading folder
          </Button>
        </div>
      )}
      {page && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-canvas/30 text-[11px] text-muted">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Size</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((item) => {
                  const child = selection(item)
                  const preview =
                    !item.isDirectory && canPreviewFile(child) && (!file.upload || file.upload.phase === 'complete')
                  return (
                    <tr className="border-t border-border hover:bg-surface" key={item.path}>
                      <td className="p-4">
                        <button
                          className="inline-flex items-center gap-2 text-left disabled:cursor-default"
                          disabled={!item.isDirectory}
                          onClick={() => navigate(item.path)}
                          type="button"
                        >
                          {item.isDirectory ? (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-800/10 text-accent">
                              <Folder size={16} />
                            </span>
                          ) : (
                            <FileTypeIcon fileName={item.name} />
                          )}
                          <span className="max-w-[260px] truncate">{item.name}</span>
                        </button>
                      </td>
                      <td className="p-4 whitespace-nowrap text-muted">
                        {item.size === undefined ? '—' : formatFileSize(item.size)}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <button
                            className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent disabled:opacity-40"
                            disabled={downloadBlocked(child)}
                            onClick={() => onDownload(child)}
                            type="button"
                          >
                            <Download size={14} />
                            {isQueued(child.id)
                              ? 'Cancel queued download'
                              : activeDownloadId === child.id
                                ? 'Downloading…'
                                : item.isDirectory
                                  ? 'Download ZIP'
                                  : 'Download'}
                          </button>
                          {preview && (
                            <a
                              className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent"
                              href={getIpfsGatewayPreviewLink(item.cid, item.name)}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              <Eye size={14} /> Preview
                            </a>
                          )}
                          <ShareFileButton file={child} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!page.items.length && (
                  <tr>
                    <td className="p-8 text-center text-sm text-muted" colSpan={3}>
                      This folder is empty.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {(offset > 0 || page.hasMore) && (
            <div className="flex items-center justify-between border-t border-border p-4">
              <Button
                className="w-auto"
                disabled={offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - DIRECTORY_PAGE_SIZE))}
                size="sm"
                variant="secondary"
              >
                Previous
              </Button>
              <span className="text-xs text-muted">Page {offset / DIRECTORY_PAGE_SIZE + 1}</span>
              <Button
                className="w-auto"
                disabled={!page.hasMore}
                onClick={() => setOffset((value) => value + DIRECTORY_PAGE_SIZE)}
                size="sm"
                variant="secondary"
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
