import { GitBranchIcon, Github, Terminal } from 'lucide-react'
import { SIDEBAR_CONFIG } from '../../constants/sidebar.tsx'
import { LinkIcon } from '../ui/link-icon.tsx'
import { LinkIconContainer } from '../ui/link-icon-container.tsx'

export default function SidebarLinks() {
  const { githubAction, cli, cloneDemo } = SIDEBAR_CONFIG.github
  return (
    <LinkIconContainer>
      <LinkIcon href={githubAction} icon={Github} text="GitHub Action" />
      <LinkIcon href={cli} icon={Terminal} text="CLI" />
      <LinkIcon href={cloneDemo} icon={GitBranchIcon} text="Clone this demo" />
    </LinkIconContainer>
  )
}
