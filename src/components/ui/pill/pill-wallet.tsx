import { LogOut } from 'lucide-react'
import { PillWrapper } from './pill-wrapper.tsx'

type PillWalletProps = {
  address: string
  href: string
  onDisconnect?: () => void
}

function PillWallet({ address, href, onDisconnect }: PillWalletProps) {
  return (
    <PillWrapper ariaLabel={`Wallet address: ${address}`} href={href}>
      <div className="flex items-center gap-2">
        <span>{address}</span>
        {onDisconnect && (
          <button
            aria-label="Disconnect wallet"
            className="relative z-10 ml-1 text-zinc-400 hover:text-zinc-100 transition-colors"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDisconnect()
            }}
            title="Disconnect wallet"
            type="button"
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </PillWrapper>
  )
}

export { PillWallet }
