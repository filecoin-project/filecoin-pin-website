import { GitBranchIcon, Github, Terminal } from 'lucide-react'
import { SIDEBAR_LINKS } from '../../constants/sidebar-links.tsx'
import { LinkIcon } from '../ui/link-icon.tsx'
import { LinkIconContainer } from '../ui/link-icon-container.tsx'

export default function SidebarLinks() {
  return (
    <LinkIconContainer>
      <LinkIcon href={SIDEBAR_LINKS.GITHUB_ACTION} icon={Github} text="GitHub Action" />
      <LinkIcon href={SIDEBAR_LINKS.CLI} icon={Terminal} text="CLI" />
      <LinkIcon href={SIDEBAR_LINKS.CLONE_THIS_DEMO} icon={GitBranchIcon} text="Clone this demo" />
    </LinkIconContainer>
  )
}
