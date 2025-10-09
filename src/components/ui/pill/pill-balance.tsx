import { PillWrapper } from './pill-wrapper';

type PillBalanceProps = {
  balances: [
    { label: 'tFIL'; value: string },
    { label: 'tUSDFC'; value: string },
  ]
}

function PillBalance({ balances }: PillBalanceProps) {
  const ariaLabel = `Balances: ${balances.map((balance) => `${balance.value} ${balance.label}`).join(', ')}`

  return (
    <PillWrapper ariaLabel={ariaLabel}>
      <div className="flex gap-3">
        {balances.map((balance, index) => (
          <div key={index} className="flex gap-1.5">
            <span className="text-zinc-400">{balance.label}</span>
            <span>{balance.value}</span>
          </div>
        ))}
      </div>
    </PillWrapper>
  )
}

export { PillBalance }
