import type { FilLabel, UsdfcLabel } from '../../../types/network.ts'
import { PillWrapper } from './pill-wrapper.tsx'

type PillBalanceProps = {
  balances: Array<{ label: FilLabel | UsdfcLabel; value: string }>
}

function PillBalance({ balances }: PillBalanceProps) {
  const ariaLabel = `Balances: ${balances.map((balance) => `${balance.value} ${balance.label}`).join(', ')}`

  console.log(balances)

  return (
    <PillWrapper ariaLabel={ariaLabel}>
      <div className="flex gap-3">
        {balances.map((balance) => (
          <div className="flex gap-1.5" key={balance.label}>
            <span className="text-zinc-400">{balance.label}</span>
            <span>{balance.value}</span>
          </div>
        ))}
      </div>
    </PillWrapper>
  )
}

export { PillBalance }
