import {
  CALIBRATION_LABEL_FIL,
  CALIBRATION_LABEL_USDFC,
  MAINNET_LABEL_FIL,
  MAINNET_LABEL_USDFC,
} from '../../constants/network.tsx'
import { useWallet } from '../../hooks/use-wallet.ts'
import { shortenAddress } from '../../lib/filecoin-pin/wallet.ts'
import type { FilLabel, UsdfcLabel } from '../../types/network.ts'
import { Logo } from '../ui/logo.tsx'
import { PillBalance } from '../ui/pill/pill-balance.tsx'
import { PillWallet } from '../ui/pill/pill-wallet.tsx'

export default function Header() {
  const { status, balances, address, network, disconnect, isUsingWallet } = useWallet()

  const isCalibration = network === 'calibration'
  const filLabel: FilLabel = isCalibration ? CALIBRATION_LABEL_FIL : MAINNET_LABEL_FIL
  const usdfcLabel: UsdfcLabel = isCalibration ? CALIBRATION_LABEL_USDFC : MAINNET_LABEL_USDFC

  const renderValue = (value?: string, label?: FilLabel | UsdfcLabel) => {
    if (value && value.trim().length > 0) {
      const numericValue = value.replace(` ${label}`, '').trim()
      return { value: numericValue, label }
    }
    if (status === 'loading') return { value: 'Loading...', label }
    if (status === 'error') return { value: 'Unavailable', label }
    return { value: '--', label }
  }

  const filDisplay = renderValue(balances?.fil, filLabel)
  const usdfcDisplay = renderValue(balances?.usdfc, usdfcLabel)
  const addressDisplay = address ? shortenAddress(address) : renderValue()?.value

  return (
    <header className="flex items-center justify-between">
      <Logo />

      <div className="flex items-center gap-4">
        {filDisplay.label && usdfcDisplay.label && (
          <PillBalance
            balances={[
              { label: filDisplay.label, value: filDisplay.value ?? '' },
              { label: usdfcDisplay.label, value: usdfcDisplay.value ?? '' },
            ]}
          />
        )}
        <PillWallet
          address={addressDisplay}
          href={`https://filscan.io/en/address/${address}`}
          onDisconnect={isUsingWallet ? disconnect : undefined}
        />
      </div>
    </header>
  )
}
