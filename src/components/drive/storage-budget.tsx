import { useQuery } from '@tanstack/react-query'
import { Calculator, Check } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { quoteStorageBudget } from '../../lib/filecoin-pin/storage-budget.ts'
import { storageBudgetInputError } from '../../lib/filecoin-pin/storage-budget-input.ts'
import { formatFundingAmount } from '../../lib/filecoin-pin/upload-funding.ts'
import { ButtonBase } from '../ui/button/button-base.tsx'

export function StorageBudget({
  onSuggestedAmount,
  disabled,
  children,
}: {
  onSuggestedAmount: (amount: string) => void
  disabled: boolean
  children?: ReactNode
}) {
  const { synapse, storageScope } = useFilecoinPinContext()
  const { transactionRevision } = useBrowserWallet()
  const [capacity, setCapacity] = useState('1')
  const [days, setDays] = useState('30')
  const [budget, setBudget] = useState({ capacity, days })
  useEffect(() => {
    const timer = window.setTimeout(() => setBudget({ capacity, days }), 400)
    return () => window.clearTimeout(timer)
  }, [capacity, days])
  const editing = budget.capacity !== capacity || budget.days !== days
  const inputError = storageBudgetInputError(capacity, days)
  const valid = !inputError
  const quote = useQuery({
    queryKey: ['drive-storage-budget', storageScope, transactionRevision, budget.capacity, budget.days],
    enabled: !!synapse && !!storageScope && valid && !editing,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      if (!synapse || !storageScope) throw new Error('Connect a wallet first.')
      return quoteStorageBudget(synapse, storageScope, budget.capacity, budget.days)
    },
  })
  const data = valid && !editing ? quote.data : undefined
  const suggestedAmount =
    data && !quote.isFetching && !quote.isError
      ? data.costs.depositNeeded > 0n
        ? formatFundingAmount(data.costs.depositNeeded)
        : ''
      : undefined
  useEffect(() => {
    if (suggestedAmount !== undefined) onSuggestedAmount(suggestedAmount)
  }, [suggestedAmount, onSuggestedAmount])
  return (
    <section aria-label="Storage funds" className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Calculator aria-hidden="true" className="text-accent" size={16} />
            Storage funds
          </h3>
          {data && (
            <span className="rounded-md bg-surface-raised px-2 py-1 text-[11px] text-muted">{data.copies} copies</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0 space-y-1.5 text-xs text-muted">
            Expected storage (GiB)
            <input
              aria-label="Expected storage in GiB"
              className="drive-field block h-10 w-full px-3 text-sm text-foreground"
              min="0"
              onChange={(event) => setCapacity(event.target.value)}
              step="any"
              type="number"
              value={capacity}
            />
          </label>
          <label className="min-w-0 space-y-1.5 text-xs text-muted">
            Duration (days)
            <input
              aria-label="Storage budget in days"
              className="drive-field block h-10 w-full px-3 text-sm text-foreground"
              min="1"
              onChange={(event) => setDays(event.target.value)}
              type="number"
              value={days}
            />
          </label>
        </div>
        <div className="space-y-4" role="status">
          {valid ? (
            editing || quote.isFetching ? (
              <p className="text-sm text-muted">Estimating storage funds…</p>
            ) : quote.isError ? (
              <div className="space-y-3">
                <p className="text-sm text-warning">Storage estimate unavailable.</p>
                <ButtonBase
                  className="w-auto"
                  disabled={disabled}
                  onClick={() => void quote.refetch()}
                  size="sm"
                  variant="secondary"
                >
                  Retry estimate
                </ButtonBase>
              </div>
            ) : data ? (
              <>
                <div className="rounded-lg bg-canvas/60 p-4">
                  <p className="text-xs text-muted">Projected monthly rate</p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-semibold tabular-nums">
                    <span className="text-2xl tracking-tight">{formatFundingAmount(data.costs.rates.perMonth)}</span>
                    <span className="text-xs font-normal text-muted">USDFC / month</span>
                  </p>
                  <p className="mt-1 text-[11px] text-muted">For the selected datasets after adding this capacity.</p>
                </div>
                <dl className="space-y-3 text-sm tabular-nums">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <dt className="text-muted">Available for storage</dt>
                    <dd>
                      {formatFundingAmount(data.account.availableFunds > 0n ? data.account.availableFunds : 0n)} USDFC
                    </dd>
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3">
                    <dt className="font-medium">Suggested top-up</dt>
                    <dd className="font-semibold">{formatFundingAmount(data.costs.depositNeeded)} USDFC</dd>
                  </div>
                </dl>
                {data.costs.depositNeeded === 0n && (
                  <p className="flex items-center gap-2 text-xs text-success">
                    <Check aria-hidden="true" size={14} /> Your funds cover this budget
                  </p>
                )}
                {data.costs.needsFwssMaxApproval && (
                  <p className="text-xs text-warning">Storage payment approval is required separately.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">Estimating storage funds…</p>
            )
          ) : (
            <p className="text-xs text-warning">{inputError}</p>
          )}
        </div>
      </div>
      {children}
      <details className="border-t border-border px-4 py-3 text-xs text-muted sm:px-5">
        <summary className="w-fit cursor-pointer hover:text-foreground">How estimates work</summary>
        <div className="mt-3 space-y-2 leading-5">
          {data && <p>Currently locked: {formatFundingAmount(data.account.totalLockup)} USDFC.</p>}
          <p>
            The monthly rate covers the selected storage copies. Suggested top-up also accounts for existing account
            charges, required reserves, debt and a safety buffer. Locked reserves are not an immediate charge.
          </p>
          <p>
            Many small uploads can incur additional operation fees. Each upload rechecks its actual cost. Estimates do
            not reserve funds or submit transactions.
          </p>
        </div>
      </details>
    </section>
  )
}
