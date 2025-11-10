import { Loader2Icon, type LucideProps } from 'lucide-react'

import { cn } from '../../utils/cn.ts'

const sizes = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 32,
} as const

type SpinnerProps = Omit<LucideProps, 'size'> & {
  size?: keyof typeof sizes
}

function Spinner({ className, size = 'md', ...props }: SpinnerProps) {
  const sizeValue = sizes[size]

  return (
    <Loader2Icon
      aria-label="Loading"
      role="status"
      size={sizeValue}
      {...props}
      className={cn('text-brand-700 animate-spin flex-shrink-0', className)}
    />
  )
}

export { Spinner }
