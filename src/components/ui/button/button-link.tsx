import { ExternalLink } from '../link.tsx'
import { ButtonBase, type ButtonBaseProps } from './button-base.tsx'

type ButtonLinkProps = Omit<ButtonBaseProps, 'onClick'> & {
  href: string
}

function ButtonLink({ href, children, disabled, variant = 'secondary', ...props }: ButtonLinkProps) {
  return (
    <ExternalLink className="outline-none" href={href}>
      <ButtonBase disabled={disabled} variant={variant} {...props}>
        {children}
      </ButtonBase>
    </ExternalLink>
  )
}

export { ButtonLink }
