import { cn } from '@/utils/cn.ts'

type TextLinkProps = {
  href: string
  children: React.ReactNode
  isTruncated?: boolean
}

function TextLink({ href, children, isTruncated }: TextLinkProps) {
  return (
    <ExternalLink
      className={cn('text-brand-500 underline focus:brand-outline hover:text-brand-100', isTruncated && 'truncate')}
      href={href}
    >
      {children}
    </ExternalLink>
  )
}

type ExternalLinkProps = Omit<React.ComponentProps<'a'>, 'rel' | 'target'>

function ExternalLink(props: ExternalLinkProps) {
  return <a {...props} rel="noopener noreferrer" target="_blank" />
}

export { TextLink, ExternalLink }
