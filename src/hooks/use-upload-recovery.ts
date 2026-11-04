import { useCallback, useEffect, useRef, useState } from 'react'
import { useUploadHistory } from '../context/upload-history-context.tsx'
import { acquireContentLock } from '../lib/filecoin-pin/content-lock.ts'
import {
  CONFIRMATION_CHECK_INTERVAL,
  CONFIRMATION_CHECK_LIMIT,
  recoverUpload,
} from '../lib/filecoin-pin/recover-upload.ts'
import { mergeStorageCopies } from '../lib/local-storage/piece-cache.ts'
import { toast } from '../utils/toast.tsx'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'

export function useUploadRecovery(activeIds: ReadonlySet<string>) {
  const { getLatestHistory, mutateHistory, refreshHistory } = useUploadHistory()
  const { synapse, storageScope } = useFilecoinPinContext()
  const active = useRef(activeIds)
  active.current = activeIds
  const [checking, setChecking] = useState<ReadonlySet<string>>(new Set())
  const inFlight = useRef(new Set<string>())
  const controllers = useRef(new Set<AbortController>())
  const check = useCallback(
    async (id: string, manual = true) => {
      if (!synapse || !storageScope) {
        if (manual) toast.warning('Connect your wallet before checking upload status.')
        return
      }
      if (active.current.has(id) || inFlight.current.has(id)) {
        if (manual) toast.info('This upload is already being checked in this tab.')
        return
      }
      const file = getLatestHistory().find((file) => file.id === id)
      if (!file?.upload || file.upload.phase === 'complete' || file.upload.phase === 'failed') return
      inFlight.current.add(id)
      setChecking(new Set(inFlight.current))
      const controller = new AbortController()
      controllers.current.add(controller)
      let release: (() => Promise<void>) | undefined
      let releaseTask: (() => Promise<void>) | undefined
      try {
        releaseTask = await acquireContentLock(`${storageScope}:upload-task`, id)
        release = await acquireContentLock(storageScope, file.cid)
        if (manual || file.upload.phase === 'interrupted') await refreshHistory()
        controller.signal.throwIfAborted()
        const latestFile = getLatestHistory().find((record) => record.id === id)
        if (!latestFile?.upload || latestFile.upload.phase === 'complete') return
        const updated = await recoverUpload(synapse, latestFile, controller.signal)
        controller.signal.throwIfAborted()
        const updatedUpload = updated.upload
        const previousUpload = latestFile.upload
        if (!updatedUpload) return
        await mutateHistory((current) =>
          current.map((record) => {
            if (record.id !== id || JSON.stringify(record.upload) !== JSON.stringify(latestFile.upload)) return record
            const merged = mergeStorageCopies(record, updated)
            return {
              ...merged,
              ...(updated.datasetId ? { datasetId: updated.datasetId, pieceId: updated.pieceId } : {}),
              upload: {
                ...updatedUpload,
                checks: previousUpload.checks + 1,
                nextCheckAt: Date.now() + CONFIRMATION_CHECK_INTERVAL,
              },
            }
          })
        )
        if (manual && (updated.upload?.phase === 'pending' || updated.upload?.phase === 'interrupted'))
          toast.info(
            updated.upload.providers.some(
              (provider) => !provider.confirmed && !provider.rejected && provider.transactionHash
            )
              ? 'Storage confirmation is still pending. You can check again later.'
              : 'No new storage confirmation found. See Upload details for saved receipts.'
          )
      } catch (cause) {
        if (manual && !controller.signal.aborted)
          toast.warning(cause instanceof Error ? cause.message : 'Unable to check upload status. Please retry.')
      } finally {
        await release?.()
        await releaseTask?.()
        controllers.current.delete(controller)
        inFlight.current.delete(id)
        setChecking(new Set(inFlight.current))
      }
    },
    [synapse, storageScope, getLatestHistory, mutateHistory, refreshHistory]
  )
  useEffect(() => {
    let stopped = false
    const tick = async () => {
      if (document.visibilityState === 'hidden') return
      for (const file of getLatestHistory()) {
        if (stopped) return
        if (
          file.upload &&
          !active.current.has(file.id) &&
          file.upload.phase !== 'complete' &&
          file.upload.phase !== 'failed' &&
          (file.upload.phase !== 'interrupted' || Boolean(file.pieceCid)) &&
          file.upload.checks < CONFIRMATION_CHECK_LIMIT &&
          file.upload.nextCheckAt <= Date.now()
        )
          await check(file.id, false)
      }
    }
    const timer = window.setInterval(() => void tick(), 5000)
    void tick()
    const resume = () => void tick()
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
      for (const controller of controllers.current) controller.abort()
    }
  }, [check, getLatestHistory])
  return { check, checking }
}
