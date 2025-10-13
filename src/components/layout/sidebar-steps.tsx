import { ButtonLink } from '@/components/ui/button/button-link'
import { StepItem } from '@/components/ui/step-item'
import { StepItemContainer } from '@/components/ui/step-item-container'

export default function SidebarSteps() {
  return (
    <StepItemContainer>
      <StepItem step={1}>
        <p>A FIL wallet, a funded Filecoin Pay Account, and Warm Storage Service have been set up automatically.</p>
      </StepItem>
      <StepItem step={2}>
        <p>Select a file to pin and it will be packed into a CAR directly in the browser.</p>
      </StepItem>
      <StepItem step={3}>
        <p>
          Your file is uploaded to a Filecoin SP using its Filecoin Piece CID, and a transaction registers it on the
          Filecoin Calibration testnet.
        </p>
      </StepItem>
      <StepItem step={4}>
        <p>The Filecoin SP indexes your file and announces it to IPNI, making it discoverable by other IPFS nodes.</p>
      </StepItem>
      <StepItem step={5}>
        <p>
          Your data is safely and verifiably stored. You can audit onchain Filecoin storage proofs and retrieve files
          quickly using standard IPFS tooling (e.g., Gateways).
        </p>
      </StepItem>
      <ButtonLink href="https://docs.filecoin.io/about/how-filecoin-works/filecoin-pin/">Learn more</ButtonLink>
    </StepItemContainer>
  )
}
