import { ButtonBase, type ButtonBaseProps } from './button-base'

type ButtonLinkProps = Omit<ButtonBaseProps, 'onClick'> & {
  href: string
}

function ButtonLink({
  href,
  children,
  disabled,
  variant = 'secondary',
  ...props
}: ButtonLinkProps) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <ButtonBase disabled={disabled} variant={variant} {...props}>
        {children}
      </ButtonBase>
    </a>
  )
}

export { ButtonLink }
