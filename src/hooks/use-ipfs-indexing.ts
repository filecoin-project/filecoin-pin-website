import { checkIpniIndexer } from 'filecoin-pin/core/utils'
import { CID } from 'multiformats/cid'
import { useEffect, useRef } from 'react'
import type { DatasetPiece } from './use-dataset-pieces.ts'

export const IPFS_CHECK_LIMIT = 5
export const IPFS_CHECK_INTERVAL = 120_000
const REQUEST_TIMEOUT = 15_000

type CheckRecord = { attempts: number; nextAt: number; indexed?: boolean }
const keyFor = (scope: string) => `filecoin-drive-ipfs-checks-v1-${scope}`

export function readIndexingChecks(scope: string): Record<string, CheckRecord> {
  try {
    return JSON.parse(localStorage.getItem(keyFor(scope)) || '{}')
  } catch {
    return {}
  }
}

export function reserveIndexingCheck(scope: string, cid: string, now: number): CheckRecord | null {
  const records = readIndexingChecks(scope)
  const previous = records[cid] ?? { attempts: 0, nextAt: 0 }
  if (previous.indexed || previous.attempts >= IPFS_CHECK_LIMIT || previous.nextAt > now) return null
  const record = { attempts: previous.attempts + 1, nextAt: now + IPFS_CHECK_INTERVAL }
  // Save before the request so reloads and failed requests cannot reset the budget.
  localStorage.setItem(keyFor(scope), JSON.stringify({ ...records, [cid]: record }))
  return record
}

export function resetIndexingChecks(scope: string, cid: string) {
  const records = readIndexingChecks(scope)
  delete records[cid]
  localStorage.setItem(keyFor(scope), JSON.stringify(records))
}

export function useIpfsIndexing(
  scope: string | null,
  pieces: DatasetPiece[],
  update: (cid: string, indexed: boolean, attempts: number) => void
) {
  const latest = useRef({ pieces, update })
  latest.current = { pieces, update }
  useEffect(() => {
    if (!scope) return
    let stopped = false
    let running = false
    let request: AbortController | null = null
    const tick = async () => {
      if (stopped || running || document.visibilityState === 'hidden') return
      running = true
      try {
        const candidates = latest.current.pieces.filter(
          (file) => file.cid && file.ipfsIndexed === false && !file.deletion
        )
        const seen = new Set<string>()
        for (const file of candidates) {
          if (stopped) break
          if (seen.has(file.cid)) continue
          seen.add(file.cid)
          const previous = readIndexingChecks(scope)[file.cid]
          if (latest.current.pieces.some((record) => record.cid === file.cid && record.ipfsIndexed === true)) {
            latest.current.update(file.cid, true, previous?.attempts ?? 0)
            continue
          }
          if (previous?.indexed || (previous?.attempts ?? 0) >= IPFS_CHECK_LIMIT) {
            latest.current.update(file.cid, previous?.indexed === true, previous?.attempts ?? IPFS_CHECK_LIMIT)
            continue
          }
          let record: CheckRecord | null
          try {
            record = reserveIndexingCheck(scope, file.cid, Date.now())
          } catch {
            // Without a durable budget we must not start automatic requests.
            break
          }
          if (!record) continue
          request = new AbortController()
          const timeout = window.setTimeout(() => request?.abort(), REQUEST_TIMEOUT)
          let indexed = false
          try {
            // A root-CID lookup confirms discoverability, not the number of replicas
            // or successful retrieval of every child block.
            indexed = await checkIpniIndexer(CID.parse(file.cid), {
              maxAttempts: 1,
              ipniIndexerUrl: 'https://cid.contact',
              signal: request.signal,
            })
          } catch {
            // A miss, timeout or network error consumes one attempt, never marks stored data failed.
          } finally {
            window.clearTimeout(timeout)
          }
          if (stopped) break
          if (indexed) {
            const records = readIndexingChecks(scope)
            localStorage.setItem(
              keyFor(scope),
              JSON.stringify({ ...records, [file.cid]: { ...record, indexed: true } })
            )
          }
          latest.current.update(file.cid, indexed, record.attempts)
        }
      } catch {
        // Storage may become unavailable mid-check; retain the reserved budget.
      } finally {
        running = false
      }
    }
    // Defer startup so StrictMode's mount probe does not consume an attempt.
    const startup = window.setTimeout(() => void tick(), 1000)
    const interval = window.setInterval(() => void tick(), 5000)
    return () => {
      stopped = true
      request?.abort()
      window.clearTimeout(startup)
      window.clearInterval(interval)
    }
  }, [scope])
}
