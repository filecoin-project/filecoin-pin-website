import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn.ts'

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-colors w-full cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-800 text-zinc-100 border border-transparent disabled:bg-button-brand-disabled hover:bg-brand-700',
        secondary: 'bg-transparent text-zinc-100 border border-zinc-800 hover:bg-zinc-800',
        unstyled: '',
      },
      size: {
        sm: 'text-sm px-4 py-2 rounded-md',
        md: 'text-base px-5 py-3 rounded-lg',
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
      size: 'md',
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

function ButtonBase({ className, variant, loading, children, disabled, size = 'md', ...props }: ButtonBaseProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, loading, disabled, className, size }))}
      disabled={disabled || loading}
      {...props}
    >
      {children}
    </button>
  )
}

export { ButtonBase, type ButtonBaseProps }
