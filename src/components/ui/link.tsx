type TextLinkProps = {
  href: string
  children: React.ReactNode
}

function TextLink(props: TextLinkProps) {
  return <ExternalLink {...props} className="text-brand-500 underline focus:brand-outline hover:text-brand-100" />
}

type ExternalLinkProps = Omit<React.ComponentProps<'a'>, 'rel' | 'target'>

function ExternalLink(props: ExternalLinkProps) {
  return <a {...props} rel="noopener noreferrer" target="_blank" />
}

export { TextLink, ExternalLink }
