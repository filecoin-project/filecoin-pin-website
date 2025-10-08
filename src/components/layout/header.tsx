import { useWallet } from '../../hooks/use-wallet.ts'
import { shortenAddress } from '../../lib/filecoin-pin/wallet.ts'
import './header.css'

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
    <header className="header">
      <div>
        <h1>Filecoin Pin | IPFS DEMO</h1>
      </div>
      <div className="wallet-info">
        <div className="wallet-info-item">
          <span title={balances?.fil ?? undefined}>{filDisplay}</span>
          <span title={balances?.usdfc ?? undefined}>{usdfcDisplay}</span>
        </div>
        <div className="wallet-info-item">
          <span title={address ?? error ?? undefined}>{addressDisplay}</span>
        </div>
      </div>
    </header>
  )
}
