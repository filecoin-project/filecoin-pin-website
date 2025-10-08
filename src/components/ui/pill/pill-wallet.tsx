import { PillWrapper } from './pill-wrapper'

interface WalletPillProps {
  address: string
  href: string
}

function WalletPill({ address, href }: WalletPillProps) {
  return (
    <PillWrapper href={href} ariaLabel={`Wallet address: ${address}`}>
      <span>
        {address.slice(0, 6)}...{address.slice(-7)}
      </span>
    </PillWrapper>
  )
}

export { WalletPill }
