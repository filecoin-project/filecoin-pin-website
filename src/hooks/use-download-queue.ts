import type { Synapse } from '@filoz/synapse-sdk'
import { useEffect, useRef, useState } from 'react'
import { downloadFile } from '../lib/filecoin-pin/download.ts'
import { displayFileName } from '../lib/filecoin-pin/drive-api.ts'
import { isDeletionScheduled } from '../utils/file-deletion.ts'
import type { DatasetPiece } from './use-dataset-pieces.ts'

type QueuedDownload = { id: string; name: string }
type ActiveDownload = QueuedDownload & { stage: string }
type Job = { file: DatasetPiece; synapse: Synapse }
type Worker = { scope: string | undefined; stopped: boolean; active: Job | null; pending: Job[] }

export function useDownloadQueue(synapse: Synapse | null, scope: string | undefined) {
  const workerRef = useRef<Worker | null>(null)
  const [download, setDownload] = useState<ActiveDownload | null>(null)
  const [queuedDownloads, setQueuedDownloads] = useState<QueuedDownload[]>([])
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    const worker: Worker = { scope, stopped: false, active: null, pending: [] }
    workerRef.current = worker
    setDownload(null)
    setQueuedDownloads([])
    setDownloadError(null)
    return () => {
      // An in-flight download finishes independently; no queued job may start
      // after leaving this wallet/network or unmounting the file browser.
      worker.stopped = true
      worker.pending = []
    }
  }, [scope])

  const syncQueue = (worker: Worker) =>
    setQueuedDownloads(worker.pending.map(({ file }) => ({ id: file.id, name: displayFileName(file) })))

  const runNext = async (worker: Worker): Promise<void> => {
    if (worker.stopped || worker.active) return
    const job = worker.pending.shift()
    if (!job) return
    worker.active = job
    syncQueue(worker)
    setDownload({ id: job.file.id, name: displayFileName(job.file), stage: 'Downloading from storage provider' })
    try {
      await downloadFile(job.synapse, job.file, (stage) => {
        if (!worker.stopped && worker.active === job)
          setDownload({
            id: job.file.id,
            name: displayFileName(job.file),
            stage: stage === 'downloading' ? 'Downloading from storage provider' : 'Preparing original file',
          })
      })
    } catch (cause) {
      if (!worker.stopped)
        setDownloadError(
          `${displayFileName(job.file)}: ${cause instanceof Error ? cause.message : 'Unable to download the file'}`
        )
    } finally {
      worker.active = null
      if (!worker.stopped) {
        setDownload(null)
        void runNext(worker)
      }
    }
  }

  const enqueueDownload = (file: DatasetPiece) => {
    const worker = workerRef.current
    if (
      !worker ||
      worker.stopped ||
      worker.scope !== scope ||
      !scope ||
      !synapse ||
      !file.cid ||
      isDeletionScheduled(file)
    )
      return
    if (worker.active?.file.id === file.id || worker.pending.some((job) => job.file.id === file.id)) return
    worker.pending.push({ file, synapse })
    setDownloadError(null)
    syncQueue(worker)
    void runNext(worker)
  }

  const cancelQueuedDownload = (id: string) => {
    const worker = workerRef.current
    if (!worker || worker.stopped || worker.scope !== scope) return
    worker.pending = worker.pending.filter((job) => job.file.id !== id)
    syncQueue(worker)
  }

  return { download, queuedDownloads, downloadError, enqueueDownload, cancelQueuedDownload }
}
