import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useFilecoinPinContext } from '../hooks/use-filecoin-pin-context.ts'
import { INITIAL_STEP_STATES } from '../hooks/use-filecoin-upload.ts'
import { useUploadOrchestration } from '../hooks/use-upload-orchestration.ts'
import { useUploadRecovery } from '../hooks/use-upload-recovery.ts'
import { DEFAULT_STORAGE_COPIES } from '../lib/filecoin-pin/config.ts'
import { acquireContentLock } from '../lib/filecoin-pin/content-lock.ts'
import { normalizeFolder } from '../lib/local-storage/drive-directory.ts'
import { formatFileSize } from '../utils/format-file-size.ts'
import { toast } from '../utils/toast.tsx'
import { useBrowserWallet } from './browser-wallet-provider.tsx'
import { useUploadHistory } from './upload-history-context.tsx'

type Job = { id: string; file: File; folder: string; transferring: boolean }
type Tasks = {
  transferring: boolean
  activeIds: ReadonlySet<string>
  start: (file: File, folder: string, replaceId?: string) => Promise<boolean>
  check: (id: string) => Promise<void>
  checking: ReadonlySet<string>
}
const Context = createContext<Tasks | null>(null)
export const useUploadTasks = () => useContext(Context)

function Worker({
  job,
  transferred,
  completed,
}: {
  job: Job
  transferred: (id: string) => void
  completed: (id: string) => void
}) {
  const orchestration = useUploadOrchestration(job.id)
  const { history, hasUnsavedChanges } = useUploadHistory()
  const started = useRef(false)
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled || started.current) return
      started.current = true
      void orchestration.startUpload(job.file, job.folder)
    })
    return () => {
      cancelled = true
    }
  }, [job, orchestration.startUpload])
  const state = orchestration.activeUpload
  useEffect(() => {
    if (!started.current) return
    const saved = history.find((file) => file.id === job.id)
    if (saved?.pieceCid && !hasUnsavedChanges && !orchestration.directorySaveError) transferred(job.id)
    if (
      saved?.upload &&
      saved.upload.phase !== 'uploading' &&
      saved.upload.phase !== 'confirming' &&
      !hasUnsavedChanges &&
      !state.isUploading &&
      !orchestration.isSavingDirectory &&
      !orchestration.directorySaveError
    )
      completed(job.id)
  }, [
    state,
    history,
    orchestration.isSavingDirectory,
    orchestration.directorySaveError,
    hasUnsavedChanges,
    job.id,
    transferred,
    completed,
  ])
  return null
}

export function UploadTasksProvider({ children }: { children: ReactNode }) {
  const connection = useBrowserWallet()
  const { storageScope, refreshWallet } = useFilecoinPinContext()
  const { mutateHistory } = useUploadHistory()
  const [jobs, setJobs] = useState<Job[]>([])
  const latest = useRef(jobs)
  const starting = useRef(false)
  latest.current = jobs
  const reserved = useRef(new Set<string>())
  const taskLocks = useRef(new Map<string, () => Promise<void>>())
  const activeIds = new Set([...jobs.map((job) => job.id), ...reserved.current])
  const { check, checking } = useUploadRecovery(activeIds)
  const transferred = useCallback(
    (id: string) =>
      setJobs((current) =>
        current.some((job) => job.id === id && job.transferring)
          ? current.map((job) => (job.id === id ? { ...job, transferring: false } : job))
          : current
      ),
    []
  )
  const completed = useCallback((id: string) => {
    void taskLocks.current.get(id)?.()
    taskLocks.current.delete(id)
    setJobs((current) => (current.some((job) => job.id === id) ? current.filter((job) => job.id !== id) : current))
  }, [])
  const previousCount = useRef(0)
  const setUploading = connection.setUploading
  useEffect(() => {
    setUploading(jobs.length > 0)
    if (previousCount.current > 0 && jobs.length === 0) void refreshWallet()
    previousCount.current = jobs.length
  }, [jobs.length, setUploading, refreshWallet])
  useEffect(
    () => () => {
      setUploading(false)
      for (const release of taskLocks.current.values()) void release()
      taskLocks.current.clear()
    },
    [setUploading]
  )
  const start = useCallback(
    async (file: File, folder: string, replaceId?: string) => {
      if (starting.current || latest.current.some((job) => job.transferring)) {
        toast.info(
          'A file is still being transferred. Wait for it to reach the storage provider before starting another upload.'
        )
        return false
      }
      if (!storageScope || connection.busy) {
        toast.warning('Wallet setup is busy or unavailable. Wait for it to finish before uploading.')
        return false
      }
      starting.current = true
      setUploading(true)
      const id = crypto.randomUUID()
      reserved.current.add(id)
      try {
        folder = normalizeFolder(folder)
        taskLocks.current.set(id, await acquireContentLock(`${storageScope}:upload-task`, id))
        await mutateHistory((current) => {
          const previous = replaceId ? current.find((record) => record.id === replaceId) : undefined
          if (
            previous &&
            previous.upload?.phase !== 'failed' &&
            !(previous.upload?.phase === 'interrupted' && !previous.pieceCid)
          )
            throw new Error('Check the existing upload status before trying again.')
          return [
            {
              id,
              fileName: file.name,
              folderPath: folder,
              fileSize: formatFileSize(file.size),
              cid: '',
              pieceCid: '',
              datasetId: '',
              providerId: '',
              providerName: '',
              serviceURL: '',
              transactionHash: '',
              network: connection.network,
              uploadedAt: Date.now(),
              datasetIds: [],
              copyCount: 0,
              upload: {
                phase: 'uploading',
                expectedCopies: DEFAULT_STORAGE_COPIES,
                providers: [],
                steps: INITIAL_STEP_STATES,
                checks: 0,
                nextCheckAt: 0,
              },
            },
            ...current.filter((record) => record.id !== replaceId),
          ]
        })
        setJobs((current) => [...current, { id, file, folder, transferring: true }])
        return true
      } catch (cause) {
        await taskLocks.current.get(id)?.()
        taskLocks.current.delete(id)
        setUploading(latest.current.length > 0)
        toast.error(cause instanceof Error ? cause.message : 'Unable to start upload')
        return false
      } finally {
        starting.current = false
        reserved.current.delete(id)
      }
    },
    [connection.busy, connection.network, storageScope, mutateHistory, setUploading]
  )
  return (
    <Context.Provider
      value={{
        transferring: starting.current || jobs.some((job) => job.transferring),
        activeIds,
        start,
        check,
        checking,
      }}
    >
      {jobs.map((job) => (
        <Worker completed={completed} job={job} key={job.id} transferred={transferred} />
      ))}
      {children}
    </Context.Provider>
  )
}
