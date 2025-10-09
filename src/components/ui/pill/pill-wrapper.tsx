type PillWrapperProps = {
  children: React.ReactNode
  ariaLabel: string
  href?: string
}

function PillWrapper({ children, ariaLabel, href }: PillWrapperProps) {
  return (
    <div className="relative rounded-sm bg-zinc-800 px-3 py-1.5 font-mono text-sm text-zinc-100">
      {children}
      {href && (
        <a
          aria-label={ariaLabel}
          className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className="sr-only">{ariaLabel}</span>
        </a>
      )}
    </div>
  )
}

export { PillWrapper }
