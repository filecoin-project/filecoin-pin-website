import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useFilecoinPinContext } from '../hooks/use-filecoin-pin-context.ts'
import { INITIAL_STEP_STATES } from '../hooks/use-filecoin-upload.ts'
import { useUploadOrchestration } from '../hooks/use-upload-orchestration.ts'
import { useUploadRecovery } from '../hooks/use-upload-recovery.ts'
import { DEFAULT_STORAGE_COPIES } from '../lib/filecoin-pin/config.ts'
import { acquireContentLock } from '../lib/filecoin-pin/content-lock.ts'
import { validateDriveMetadata } from '../lib/filecoin-pin/drive-metadata.ts'
import { isDirectoryUpload, type UploadSource } from '../lib/filecoin-pin/upload-source.ts'
import { directoryFolders, normalizeFolder } from '../lib/local-storage/drive-directory.ts'
import { isDeletionScheduled } from '../utils/file-deletion.ts'
import { formatFileSize } from '../utils/format-file-size.ts'
import { toast } from '../utils/toast.tsx'
import { canRemoveUpload } from '../utils/upload/can-remove-upload.ts'
import { useBrowserWallet } from './browser-wallet-provider.tsx'
import { useUploadHistory } from './upload-history-context.tsx'

type Job = {
  id: string
  file: UploadSource
  folder: string
  phase: 'funding' | 'waiting' | 'transferring' | 'confirming' | 'canceling'
}

function advanceQueue(jobs: Job[]): Job[] {
  if (jobs.some((job) => job.phase === 'transferring' || job.phase === 'funding' || job.phase === 'canceling'))
    return jobs
  const next = jobs.find((job) => job.phase === 'waiting')
  return next ? jobs.map((job) => (job.id === next.id ? { ...job, phase: 'transferring' } : job)) : jobs
}
type Tasks = {
  transferring: boolean
  activeIds: ReadonlySet<string>
  queuedIds: ReadonlySet<string>
  startMany: (files: UploadSource[], folder: string) => Promise<boolean>
  cancelQueued: (id: string) => Promise<boolean>
  removeMany: (ids: readonly string[]) => Promise<void>
  start: (file: UploadSource, folder: string, replaceId?: string) => Promise<boolean>
  check: (id: string) => Promise<void>
  resume: (id: string) => Promise<boolean>
  retainedIds: ReadonlySet<string>
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
  completed: (id: string, funding?: boolean) => void
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
      saved.upload.phase !== 'waiting' &&
      (!state.funding || saved.upload.phase === 'funding') &&
      saved.upload.phase !== 'uploading' &&
      saved.upload.phase !== 'confirming' &&
      !hasUnsavedChanges &&
      !state.isUploading &&
      !orchestration.isSavingDirectory &&
      !orchestration.directorySaveError
    )
      completed(job.id, saved.upload.phase === 'funding')
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
  const { mutateHistory, history } = useUploadHistory()
  const [jobs, setJobs] = useState<Job[]>([])
  const latest = useRef(jobs)
  const retained = useRef(new Map<string, Job>())
  const starting = useRef(false)
  const reserved = useRef(new Set<string>())
  const taskLocks = useRef(new Map<string, () => Promise<void>>())
  const activeIds = new Set([
    ...jobs.filter((job) => job.phase !== 'funding').map((job) => job.id),
    ...reserved.current,
  ])
  const { check, checking } = useUploadRecovery(activeIds)
  const updateJobs = useCallback((update: (current: Job[]) => Job[]) => {
    const next = advanceQueue(update(latest.current))
    latest.current = next
    setJobs(next)
  }, [])
  const transferred = useCallback(
    (id: string) => {
      if (latest.current.some((job) => job.id === id && job.phase === 'transferring'))
        updateJobs((current) => current.map((job) => (job.id === id ? { ...job, phase: 'confirming' } : job)))
    },
    [updateJobs]
  )
  const completed = useCallback(
    (id: string, funding = false) => {
      if (!funding) retained.current.delete(id)
      void taskLocks.current.get(id)?.()
      taskLocks.current.delete(id)
      if (latest.current.some((job) => job.id === id))
        updateJobs((current) =>
          funding
            ? current.map((job) => (job.id === id ? { ...job, phase: 'funding' } : job))
            : current.filter((job) => job.id !== id)
        )
    },
    [updateJobs]
  )
  useEffect(() => {
    if (starting.current) return
    const stale = jobs.filter(
      (job) =>
        job.phase === 'funding' && !history.some((file) => file.id === job.id && file.upload?.phase === 'funding')
    )
    if (!stale.length) return
    const ids = new Set(stale.map((job) => job.id))
    for (const id of ids) retained.current.delete(id)
    updateJobs((current) => current.filter((job) => !ids.has(job.id)))
  }, [history, jobs, updateJobs])
  const previousCount = useRef(0)
  const setUploading = connection.setUploading
  const setUploadingRef = useRef(setUploading)
  setUploadingRef.current = setUploading
  useEffect(() => {
    setUploading(jobs.some((job) => job.phase === 'transferring' || job.phase === 'confirming'))
    if (previousCount.current > 0 && jobs.length === 0) void refreshWallet()
    previousCount.current = jobs.length
  }, [jobs, setUploading, refreshWallet])
  useEffect(
    () => () => {
      setUploadingRef.current(false)
      for (const release of taskLocks.current.values()) void release()
      taskLocks.current.clear()
    },
    []
  )
  const enqueue = useCallback(
    async (files: UploadSource[], folder: string, replaceId?: string) => {
      if (!files.length || starting.current) return false
      if (!storageScope || connection.busy || connection.pendingTransaction) {
        toast.warning('Wallet setup is busy or unavailable. Wait for it to finish before uploading.')
        return false
      }
      starting.current = true
      setUploading(true)
      const added: Job[] = files.map((file) => ({ id: crypto.randomUUID(), file, folder, phase: 'waiting' }))
      for (const job of added) reserved.current.add(job.id)
      let releasePrevious: (() => Promise<void>) | undefined
      try {
        folder = normalizeFolder(folder)
        for (const file of files) validateDriveMetadata(file.name, folder)
        if (replaceId) releasePrevious = await acquireContentLock(`${storageScope}:upload-task`, replaceId)
        for (const job of added) {
          job.folder = folder
          taskLocks.current.set(job.id, await acquireContentLock(`${storageScope}:upload-task`, job.id))
        }
        await mutateHistory((current) => {
          const previous = replaceId ? current.find((record) => record.id === replaceId) : undefined
          if (replaceId && !previous)
            throw new Error('This upload record has changed. Refresh the file list before continuing.')
          if (
            previous &&
            previous.upload?.phase !== 'failed' &&
            previous.upload?.phase !== 'funding' &&
            !(previous.upload?.phase === 'interrupted' && !previous.pieceCid)
          )
            throw new Error('Check the existing upload status before trying again.')
          const activeRecords = current.filter((record) => !isDeletionScheduled(record))
          for (const file of files) {
            if (
              activeRecords.some((record) => {
                if (!record.isDirectory) return false
                const path = [record.folderPath, record.fileName].filter(Boolean).join('/')
                return (
                  folder === path ||
                  folder.startsWith(`${path}/`) ||
                  (record.id !== replaceId && (record.folderPath ?? '') === folder && record.fileName === file.name)
                )
              })
            )
              throw new Error(
                'An uploaded folder cannot be changed or used as an upload location. Choose another location or rename the selected folder.'
              )
            if (isDirectoryUpload(file)) {
              const path = [folder, file.name].filter(Boolean).join('/')
              if (
                directoryFolders(activeRecords, []).includes(path) ||
                activeRecords.some(
                  (record) =>
                    record.id !== replaceId && (record.folderPath ?? '') === folder && record.fileName === file.name
                )
              )
                throw new Error(
                  'A file or folder with this name already exists here. Rename the folder before uploading, or choose another upload location.'
                )
            }
          }
          return [
            ...added.map(({ id, file }) => ({
              id,
              isDirectory: isDirectoryUpload(file) || undefined,
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
                phase: 'waiting' as const,
                expectedCopies: DEFAULT_STORAGE_COPIES,
                providers: [],
                steps: INITIAL_STEP_STATES,
                checks: 0,
                nextCheckAt: 0,
              },
            })),
            ...current.filter((record) => record.id !== replaceId),
          ]
        })
        if (replaceId) retained.current.delete(replaceId)
        for (const job of added) retained.current.set(job.id, job)
        updateJobs((current) =>
          replaceId ? [...added, ...current.filter((job) => job.id !== replaceId)] : [...current, ...added]
        )
        return true
      } catch (cause) {
        for (const job of added) {
          await taskLocks.current.get(job.id)?.()
          taskLocks.current.delete(job.id)
        }
        setUploading(latest.current.some((job) => job.phase === 'transferring' || job.phase === 'confirming'))
        toast.error(cause instanceof Error ? cause.message : 'Unable to start upload')
        return false
      } finally {
        try {
          await releasePrevious?.()
        } finally {
          starting.current = false
          for (const job of added) reserved.current.delete(job.id)
        }
      }
    },
    [
      connection.busy,
      connection.pendingTransaction,
      connection.network,
      storageScope,
      mutateHistory,
      setUploading,
      updateJobs,
    ]
  )
  const start = useCallback(
    (file: UploadSource, folder: string, replaceId?: string) => enqueue([file], folder, replaceId),
    [enqueue]
  )
  const startMany = useCallback((files: UploadSource[], folder: string) => enqueue(files, folder), [enqueue])
  const removeMany = useCallback(
    async (selectedIds: readonly string[]) => {
      if (starting.current || !storageScope) throw new Error('Wait for the current queue update to finish.')
      const ids = new Set(selectedIds)
      if (!ids.size) return
      const selectedJobs = latest.current.filter((job) => ids.has(job.id))
      if (selectedJobs.some((job) => job.phase !== 'waiting' && job.phase !== 'funding'))
        throw new Error('An upload has already started. Refresh the selection before removing it.')
      starting.current = true
      const phases = new Map(selectedJobs.map((job) => [job.id, job.phase]))
      const temporaryLocks: (() => Promise<void>)[] = []
      // Pause every selected job before the first await. Advance only after the whole batch is saved.
      updateJobs((current) => current.map((job) => (ids.has(job.id) ? { ...job, phase: 'canceling' } : job)))
      try {
        for (const id of ids) {
          if (!taskLocks.current.has(id))
            temporaryLocks.push(await acquireContentLock(`${storageScope}:upload-task`, id))
        }
        await mutateHistory((current) => {
          if (current.some((file) => ids.has(file.id) && !canRemoveUpload(file)))
            throw new Error('Storage status changed. Refresh the selection before removing these uploads.')
          return current.filter((file) => !ids.has(file.id))
        })
        for (const id of ids) {
          retained.current.delete(id)
          await taskLocks.current.get(id)?.()
          taskLocks.current.delete(id)
        }
        updateJobs((current) => current.filter((job) => !ids.has(job.id)))
      } catch (cause) {
        updateJobs((current) =>
          current.map((job) => (phases.has(job.id) ? { ...job, phase: phases.get(job.id) ?? job.phase } : job))
        )
        throw cause
      } finally {
        for (const release of temporaryLocks) await release()
        starting.current = false
      }
    },
    [storageScope, mutateHistory, updateJobs]
  )
  const cancelQueued = useCallback(
    async (id: string) => {
      const selected = latest.current.find((job) => job.id === id)
      if (selected?.phase !== 'waiting' && selected?.phase !== 'funding') return false
      try {
        await removeMany([id])
        return true
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : 'Unable to cancel queued upload')
        return false
      }
    },
    [removeMany]
  )
  return (
    <Context.Provider
      value={{
        transferring: jobs.some((job) => job.phase === 'transferring'),
        activeIds,
        queuedIds: new Set(jobs.filter((job) => job.phase === 'waiting').map((job) => job.id)),
        start,
        resume: async (id) => {
          const job = retained.current.get(id)
          return job ? start(job.file, job.folder, id) : false
        },
        retainedIds: new Set(retained.current.keys()),
        startMany,
        cancelQueued,
        removeMany,
        check,
        checking,
      }}
    >
      {jobs
        .filter((job) => job.phase === 'transferring' || job.phase === 'confirming')
        .map((job) => (
          <Worker completed={completed} job={job} key={job.id} transferred={transferred} />
        ))}
      {children}
    </Context.Provider>
  )
}
