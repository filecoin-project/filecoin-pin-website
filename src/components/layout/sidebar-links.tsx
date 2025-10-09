import { GitBranchIcon, Github, Terminal } from 'lucide-react'
import { LinkIcon } from '../ui/link-icon.tsx'
import { LinkIconContainer } from '../ui/link-icon-container.tsx'

export default function SidebarLinks() {
  return (
    <LinkIconContainer>
      <LinkIcon
        href="https://docs.filecoin.io/about/how-filecoin-works/filecoin-pin/"
        icon={Github}
        text="GitHub Action"
      />
      <LinkIcon href="https://docs.filecoin.io/about/how-filecoin-works/filecoin-pin/" icon={Terminal} text="CLI" />
      <LinkIcon
        href="https://docs.filecoin.io/about/how-filecoin-works/filecoin-pin/"
        icon={GitBranchIcon}
        text="Clone this demo"
      />
    </LinkIconContainer>
  )
}
