import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn.ts'

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium px-5 py-3 rounded-md transition-colors w-full hover:opacity-90',
  {
    variants: {
      variant: {
        primary: 'bg-brand-800 text-zinc-100 border border-transparent disabled:bg-button-brand-disabled',
        secondary: 'bg-transparent text-zinc-100 border border-zinc-800 hover:bg-zinc-800',
      },
      loading: {
        true: 'cursor-wait',
        false: 'cursor-pointer',
      },
      disabled: {
        true: 'opacity-50 cursor-not-allowed pointer-events-none',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      loading: false,
      disabled: false,
    },
  }
)

type ButtonBaseProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
  }

function ButtonBase({ className, variant, loading, children, disabled, ...props }: ButtonBaseProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, loading, disabled, className }))}
      disabled={disabled || loading}
      {...props}
    >
      {children}
    </button>
  )
}

export { ButtonBase, type ButtonBaseProps }
