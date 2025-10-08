type PillWrapperProps = {
  children: React.ReactNode
  ariaLabel: string
  href?: string
}

function PillWrapper({ children, ariaLabel, href }: PillWrapperProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className="relative rounded-sm bg-zinc-800 px-3 py-1.5 font-mono text-sm text-zinc-100"
    >
      {children}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        />
      )}
    </div>
  )
}

export { PillWrapper }
