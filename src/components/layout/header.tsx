import { useWallet } from '../../hooks/use-wallet.ts'
import { shortenAddress } from '../../lib/filecoin-pin/wallet.ts'
import './header.css'

export default function Header() {
  const { status, balances, address, error } = useWallet()

  const renderValue = (value?: string) => {
    if (value && value.trim().length > 0) return value
    if (status === 'loading') return 'Loading...'
    if (status === 'error') return 'Unavailable'
    return '--'
  }

  const filDisplay = renderValue(balances?.fil)
  const usdfcDisplay = renderValue(balances?.usdfc)
  const addressDisplay = address ? shortenAddress(address) : renderValue()

  return (
    <header className="header">
      <div>
        <h1>Filecoin Pin | IPFS DEMO</h1>
      </div>
      <div className="wallet-info">
        <div className="wallet-info-item">
          <span title={balances?.fil ?? undefined}>tFIL {filDisplay}</span>
          <span title={balances?.usdfc ?? undefined}>tUSDFC {usdfcDisplay}</span>
        </div>
        <div className="wallet-info-item">
          <span title={address ?? error ?? undefined}>{addressDisplay}</span>
        </div>
      </div>
    </header>
  )
}
