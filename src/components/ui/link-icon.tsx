import type { LucideIcon } from 'lucide-react'

type LinkIconProps = {
  icon: LucideIcon
  text: string
  href: string
}
function LinkIcon({ icon: Icon, text, href }: LinkIconProps) {
  return (
    <a
      className="flex w-fit gap-2 font-medium text-zinc-400 outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      href={href}
    >
      <Icon className="h-6 w-6" />
      <span>{text}</span>
    </a>
  )
}

export { LinkIcon }
