import type { LucideIcon } from 'lucide-react'
import { ExternalLink } from './link.tsx'

type LinkIconProps = {
  icon: LucideIcon
  text: string
  href: string
}
function LinkIcon({ icon: Icon, text, href }: LinkIconProps) {
  return (
    <ExternalLink
      className="flex w-fit gap-2 font-medium text-zinc-400  hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      href={href}
    >
      <Icon className="h-6 w-6" />
      <span>{text}</span>
    </ExternalLink>
  )
}

export { LinkIcon }
