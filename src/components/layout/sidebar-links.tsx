import { GitBranchIcon, Github, Terminal } from 'lucide-react'
import { LinkIcon } from '@/components/ui/link-icon'
import { LinkIconContainer } from '@/components/ui/link-icon-container'

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
