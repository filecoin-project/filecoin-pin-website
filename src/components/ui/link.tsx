type LinkProps = {
  href: string
  children: React.ReactNode
}

function Link({ href, children }: LinkProps) {
  return (
    <a className="text-brand-500 underline" href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  )
}

export { Link }
