import { useQuery } from '@tanstack/react-query'
import { getStorageRunway } from 'filecoin-pin/core/payments'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'

// Match Pay Console's conservative whole-unit duration labels.
function formatRunwayDays(days: number): string {
  if (!Number.isFinite(days)) return 'No recurring charges'
  if (days < 1) return 'Less than a day'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `+${months} month${months === 1 ? '' : 's'}`
  }
  const years = Math.floor(days / 365)
  return `+${years} year${years === 1 ? '' : 's'}`
}

/** Fetch only when the wallet setup surface is mounted; failure never blocks funding. */
export function StorageRunway() {
  const { synapse, storageScope } = useFilecoinPinContext()
  const { transactionRevision } = useBrowserWallet()
  const runway = useQuery({
    queryKey: ['drive-storage-runway', storageScope, transactionRevision],
    enabled: !!synapse && !!storageScope,
    queryFn: async () => {
      if (!synapse) throw new Error('Connect a wallet first.')
      return getStorageRunway(synapse)
    },
  })
  const result = runway.data
  const label = runway.isError
    ? 'Unavailable — refresh balances to retry'
    : result
      ? result.state === 'no-spend'
        ? 'No recurring charges'
        : formatRunwayDays(result.runwayDays)
      : 'Checking…'
  return (
    <div className="rounded-lg border border-border bg-canvas/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">Runway</span>
        <span className="font-medium text-foreground" role="status">
          {label}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted">
        Estimated time before a top-up is needed at your Filecoin Pay account’s current recurring rate. Excludes locked
        reserves; uploads and other payment activity can change this estimate.
      </p>
    </div>
  )
}
