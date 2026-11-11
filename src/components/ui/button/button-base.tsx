import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn.ts'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors w-full cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-button-brand text-white border border-brand-700/30 disabled:bg-button-brand-disabled hover:bg-button-brand-hover shadow-sm',
        secondary: 'bg-surface text-foreground border border-border hover:bg-surface-raised hover:border-muted',
        danger: 'bg-red-500/10 text-danger border border-red-500/25 hover:bg-red-500/20 hover:border-red-500/50',
        unstyled: '',
      },
      size: {
        sm: 'min-h-10 text-sm px-4 py-2 rounded-lg',
        md: 'min-h-11 text-sm px-5 py-3 rounded-lg',
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

export { ButtonBase, type ButtonBaseProps, buttonVariants }
