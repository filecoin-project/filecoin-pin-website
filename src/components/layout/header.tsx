import { useWallet } from '../../hooks/use-wallet.ts'
import { shortenAddress } from '../../lib/filecoin-pin/wallet.ts'
import './header.css'
import { Logo } from '../ui/logo.tsx'
import { PillBalance } from '../ui/pill/pill-balance.tsx'
import { PillWallet } from '../ui/pill/pill-wallet.tsx'

export default function Header() {
  const { status, balances, address, error, network } = useWallet()

  const isCalibration = network === 'calibration'
  const filLabel = isCalibration ? 'tFIL' : 'FIL'
  const usdfcLabel = isCalibration ? 'tUSDFC' : 'USDFC'

  const renderValue = (value?: string, label?: string) => {
    if (value && value.trim().length > 0) return value
    if (status === 'loading') return label ? `${label} Loading...` : 'Loading...'
    if (status === 'error') return label ? `${label} Unavailable` : 'Unavailable'
    return label ? `${label} --` : '--'
  }

  const filDisplay = renderValue(balances?.fil, filLabel)
  const usdfcDisplay = renderValue(balances?.usdfc, usdfcLabel)
  const addressDisplay = address ? shortenAddress(address) : renderValue()

  return (
    <header className="flex items-center justify-between">
      <div>
        <Logo />
      </div>

      <div className="wallet-info">
        <PillBalance
          balances={[
            { label: 'tFIL', value: filDisplay },
            { label: 'tUSDFC', value: usdfcDisplay },
          ]}
        />
        <PillWallet address={addressDisplay} href={`https://filscan.io/en/address/${address}`} />

        {/* <div className="wallet-info-item">
          <span title={address ?? error ?? undefined}>{addressDisplay}</span>
        </div> */}
      </div>
    </header>
  )
}
