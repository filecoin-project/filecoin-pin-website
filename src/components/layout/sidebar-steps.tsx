import { SIDEBAR_CONFIG } from '@/constants/sidebar.tsx'
import { ButtonLink } from '../ui/button/button-link.tsx'
import { TextLink } from '../ui/link.tsx'
import { StepItem } from '../ui/step-item.tsx'
import { StepItemContainer } from '../ui/step-item-container.tsx'

export default function SidebarSteps() {
  const { car, ipni, filecoinPin } = SIDEBAR_CONFIG.documentation

  return (
    <StepItemContainer>
      <StepItem step={1}>
        <p>A FIL wallet, a funded Filecoin Pay Account, and Warm Storage Service have been set up automatically.</p>
      </StepItem>
      <StepItem step={2}>
        <p>
          Select a file to pin and it will be packed into a <TextLink href={car}>CAR </TextLink>
          directly in the browser.
        </p>
      </StepItem>
      <StepItem step={3}>
        <p>
          Your file is uploaded to a Filecoin SP using its Filecoin Piece CID, and a transaction registers it on the
          Filecoin Calibration testnet.
        </p>
      </StepItem>
      <StepItem step={4}>
        <p>
          The Filecoin SP indexes your file and announces it to <TextLink href={ipni}>IPNI</TextLink>, making it
          discoverable by other IPFS nodes.
        </p>
      </StepItem>
      <StepItem step={5}>
        <p>
          Your data is safely and verifiably stored. You can audit onchain Filecoin storage proofs and retrieve files
          quickly using standard IPFS tooling (e.g., Gateways).
        </p>
      </StepItem>
      <ButtonLink href={filecoinPin}>Learn more</ButtonLink>
    </StepItemContainer>
  )
}
