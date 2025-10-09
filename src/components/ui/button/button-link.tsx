import { ButtonBase, type ButtonBaseProps } from './button-base.tsx'

type ButtonLinkProps = Omit<ButtonBaseProps, 'onClick'> & {
  href: string
}

function ButtonLink({ href, children, disabled, variant = 'secondary', ...props }: ButtonLinkProps) {
  return (
    <a href={href} rel="noopener noreferrer" target="_blank">
      <ButtonBase disabled={disabled} variant={variant} {...props}>
        {children}
      </ButtonBase>
    </a>
  )
}

export { ButtonLink }
