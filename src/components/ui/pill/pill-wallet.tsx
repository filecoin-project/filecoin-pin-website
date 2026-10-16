import { PillWrapper } from './pill-wrapper.tsx'

type PillWalletProps = {
  address: string
  href: string
}

function PillWallet({ address, href }: PillWalletProps) {
  return (
    <PillWrapper
      ariaLabel={`Wallet address: ${address}`}
      className="hover:bg-surface-raised cursor-pointer"
      href={href}
    >
      <span>{address}</span>
    </PillWrapper>
  )
}

export { PillWallet }
