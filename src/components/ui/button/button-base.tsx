import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../../utils/cn.ts'

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium px-5 py-3  rounded-sm transition-colors w-full disabled:pointer-events-none disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: ['bg-button-brand text-zinc-100 border border-transparent disabled:bg-button-brand-disabled'],
        secondary: ['bg-transparent text-zinc-100 border border-zinc-800'],
      },
      loading: {
        true: 'cursor-wait',
        false: 'cursor-pointer',
      },
    },
    defaultVariants: {
      variant: 'primary',
      loading: false,
    },
  }
)

type ButtonBaseProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
  }

function ButtonBase({ className, variant, loading, children, disabled, ...props }: ButtonBaseProps) {
  return (
    <button className={cn(buttonVariants({ variant, loading, className }))} disabled={disabled || loading} {...props}>
      {children}
    </button>
  )
}

export { ButtonBase, type ButtonBaseProps }
