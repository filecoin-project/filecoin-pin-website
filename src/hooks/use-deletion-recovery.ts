import { useEffect, useRef, useState } from 'react'
import { useUploadHistory } from '../context/upload-history-context.tsx'
import { type DriveNetwork, publicClient } from '../lib/filecoin-pin/browser-wallet.ts'
import { planDeletion, withFileDeletionLock } from '../lib/filecoin-pin/delete.ts'
import { resolveTransactionReceipt } from '../lib/filecoin-pin/transaction-receipt.ts'
import { applyDeletionUpdate, isCopyRemovalScheduled } from '../utils/file-deletion.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'

const CHECK_INTERVAL = 30_000
const AUTO_CHECK_WINDOW = 10 * 60_000
const EMPTY_SET: ReadonlySet<string> = new Set()

/** Read saved removal receipts only. Never submit or resume an unfinished deletion. */
export function useDeletionRecovery(
  activePieceCids: ReadonlySet<string>,
  onFailure: (pieceCid: string, message: string) => void
) {
  const { storageScope } = useFilecoinPinContext()
  const [automatic, setAutomatic] = useState<{ scope: string; contents: ReadonlySet<string> } | null>(null)
  const wake = useRef<(() => void) | null>(null)
  const { getLatestHistory, mutateHistory } = useUploadHistory()
  const active = useRef(activePieceCids)
  const failure = useRef(onFailure)
  failure.current = onFailure

  useEffect(() => {
    if (!storageScope) return
    let stopped = false
    let running = false
    const checks = new Map<string, { deadline: number; next: number }>()
    const inFlight = new Set<string>()
    const publish = () => {
      if (stopped) return
      const contents = new Set<string>()
      for (const file of getLatestHistory()) {
        for (const [id, checkpoint] of Object.entries(file.deletion ?? {})) {
          if (checkpoint.confirmed || isCopyRemovalScheduled(file, id)) continue
          const key = `${id}:${checkpoint.transactionHash}`
          const budget = checks.get(key)
          if (budget && (budget.deadline > Date.now() || inFlight.has(key))) contents.add(file.pieceCid)
        }
      }
      setAutomatic((previous) =>
        previous?.scope === storageScope &&
        previous.contents.size === contents.size &&
        [...contents].every((cid) => previous.contents.has(cid))
          ? previous
          : { scope: storageScope, contents }
      )
    }
    const tick = async (resume = false) => {
      if (stopped || running || document.visibilityState === 'hidden') return
      running = true
      try {
        const contents = new Set<string>()
        const files = getLatestHistory().filter((file) => {
          if (active.current.has(file.pieceCid) || contents.has(file.pieceCid)) return false
          const pending = Object.entries(file.deletion ?? {}).some(
            ([id, checkpoint]) => !checkpoint.confirmed && !isCopyRemovalScheduled(file, id)
          )
          if (pending) {
            contents.add(file.pieceCid)
            for (const [id, checkpoint] of Object.entries(file.deletion ?? {})) {
              if (checkpoint.confirmed || isCopyRemovalScheduled(file, id)) continue
              const key = `${id}:${checkpoint.transactionHash}`
              if (!checks.has(key)) checks.set(key, { deadline: Date.now() + AUTO_CHECK_WINDOW, next: 0 })
            }
          }
          return pending
        })
        publish()
        let index = 0
        await Promise.all(
          Array.from({ length: Math.min(2, files.length) }, async () => {
            while (!stopped && document.visibilityState !== 'hidden' && index < files.length) {
              const file = files[index++]
              if (active.current.has(file.pieceCid)) continue
              try {
                await withFileDeletionLock(storageScope, file.cid, async () => {
                  const history = getLatestHistory()
                  const selected = history.find((record) => record.id === file.id)
                  if (!selected || stopped || active.current.has(file.pieceCid)) return
                  const current = planDeletion(history, selected).file
                  await Promise.allSettled(
                    Object.entries(current.deletion ?? {}).map(async ([datasetId, checkpoint]) => {
                      if (stopped || checkpoint.confirmed || isCopyRemovalScheduled(current, datasetId)) return
                      const key = `${datasetId}:${checkpoint.transactionHash}`
                      const budget = checks.get(key) ?? { deadline: Date.now() + AUTO_CHECK_WINDOW, next: 0 }
                      checks.set(key, budget)
                      if (budget.next > Date.now() || (!resume && budget.deadline <= Date.now())) return
                      budget.next = Date.now() + CHECK_INTERVAL
                      inFlight.add(key)
                      publish()
                      let result: Awaited<ReturnType<typeof resolveTransactionReceipt>>
                      try {
                        result = await resolveTransactionReceipt(publicClient(current.network as DriveNetwork), {
                          hash: checkpoint.transactionHash as `0x${string}`,
                          messageCid: checkpoint.messageCid,
                        })
                      } finally {
                        inFlight.delete(key)
                      }
                      if (stopped) return
                      const failed = result.status === 'reverted' || result.status === 'replaced'
                      const next = failed
                        ? undefined
                        : {
                            ...checkpoint,
                            transactionHash: result.hash ?? checkpoint.transactionHash,
                            confirmed: result.status === 'success',
                            ...(result.messageCid ? { messageCid: result.messageCid } : {}),
                          }
                      if (JSON.stringify(next) !== JSON.stringify(checkpoint))
                        await mutateHistory((records) =>
                          records.map((record) =>
                            record.pieceCid === file.pieceCid
                              ? applyDeletionUpdate(record, { datasetId, previous: checkpoint, next })
                              : record
                          )
                        )
                      if (failed)
                        failure.current(
                          file.pieceCid,
                          result.status === 'replaced'
                            ? `Deletion transaction was replaced by a different operation for dataset ${datasetId}. Check its result before retrying.`
                            : `Deletion transaction reverted for dataset ${datasetId}. Retry to submit again.`
                        )
                    })
                  )
                })
              } catch {
                // Another tab may own this content, or the read/save failed. Retain checkpoints for retry.
              }
            }
          })
        )
      } finally {
        running = false
        publish()
      }
    }
    wake.current = () => void tick()
    const timer = window.setInterval(() => void tick(), CHECK_INTERVAL)
    const resume = () => void tick(true)
    void tick()
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)
    document.addEventListener('visibilitychange', resume)
    document.addEventListener('resume', resume)
    return () => {
      stopped = true
      wake.current = null
      clearInterval(timer)
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
      document.removeEventListener('visibilitychange', resume)
      document.removeEventListener('resume', resume)
    }
  }, [storageScope, getLatestHistory, mutateHistory])
  useEffect(() => {
    active.current = activePieceCids
    wake.current?.()
  }, [activePieceCids])
  return automatic && automatic.scope === storageScope ? automatic.contents : EMPTY_SET
}
