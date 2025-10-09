import { PillWrapper } from './pill-wrapper.tsx'

type PillWalletProps = {
  address: string
  href: string
}

function PillWallet({ address, href }: PillWalletProps) {
  return (
    <PillWrapper ariaLabel={`Wallet address: ${address}`} href={href}>
      <span>{address}</span>
    </PillWrapper>
  )
}

export { PillWallet }
