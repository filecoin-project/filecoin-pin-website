import { ButtonBase, type ButtonBaseProps } from './button-base.tsx'
import { ExternalLink } from '../link.tsx'

type ButtonLinkProps = Omit<ButtonBaseProps, 'onClick'> & {
  href: string
}

function ButtonLink({ href, children, disabled, variant = 'secondary', ...props }: ButtonLinkProps) {
  return (
    <ExternalLink href={href}>
      <ButtonBase disabled={disabled} variant={variant} {...props}>
        {children}
      </ButtonBase>
    </ExternalLink>
  )
}

export { ButtonLink }
