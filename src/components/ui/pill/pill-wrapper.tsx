import { ExternalLink } from '../link.tsx'
import { cn } from '@/utils/cn.ts'

type PillWrapperProps = {
  children: React.ReactNode
  ariaLabel: string
  href?: string
  className?: string
}

function PillWrapper({ children, ariaLabel, href, className }: PillWrapperProps) {
  return (
    <div className={cn("relative rounded-sm bg-zinc-800 px-3 py-1.5 font-mono text-sm text-zinc-100 focus-within:brand-outline", className)}>
      {children}
      {href && (
        <ExternalLink
          aria-label={ariaLabel}
          className="absolute inset-0 outline-none"
          href={href}
        >
          <span className="sr-only">{ariaLabel}</span>
        </ExternalLink>
      )}
    </div>
  )
}

export { PillWrapper }
