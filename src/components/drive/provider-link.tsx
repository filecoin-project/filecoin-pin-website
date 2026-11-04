import { type ReactNode, useEffect, useState } from 'react'
import type { DriveNetwork } from '../../lib/filecoin-pin/browser-wallet.ts'
import { resolveProviderExplorerLink } from '../../lib/filecoin-pin/provider-explorer.ts'

export function ProviderLink({
  providerId,
  network,
  children = 'Provider',
}: {
  providerId: string
  network: DriveNetwork
  children?: ReactNode
}) {
  const [result, setResult] = useState<{ identity: string; url?: string; error?: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const identity = `${network}:${providerId}:${attempt}`
  useEffect(() => {
    let cancelled = false
    void resolveProviderExplorerLink(providerId, network)
      .then((url) => {
        if (!cancelled) setResult({ identity, url })
      })
      .catch(() => {
        if (!cancelled) setResult({ identity, error: true })
      })
    return () => {
      cancelled = true
    }
  }, [providerId, network, identity])
  if (result?.identity === identity && result.url)
    return (
      <a className="underline" href={result.url} rel="noopener noreferrer" target="_blank">
        {children}
      </a>
    )
  if (result?.identity === identity && result.error)
    return (
      <button
        className="cursor-pointer underline"
        onClick={() => {
          setResult(null)
          setAttempt((value) => value + 1)
        }}
        title="Unable to load provider address. Click to retry."
        type="button"
      >
        {children} · retry
      </button>
    )
  return (
    <span className="text-muted" title="Loading provider address…">
      {children}
    </span>
  )
}
