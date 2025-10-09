import { PillWrapper } from './pill-wrapper'

type PillWalletProps = {
  address: string
  href: string
}

function PillWallet({ address, href }: PillWalletProps) {
  return (
    <PillWrapper href={href} ariaLabel={`Wallet address: ${address}`}>
      <span>
        {address.slice(0, 6)}...{address.slice(-7)}
      </span>
    </PillWrapper>
  )
}

export { PillWallet }
