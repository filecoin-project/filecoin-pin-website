import { ChevronDown } from 'lucide-react'
import type { ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '../../utils/cn.ts'

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  leadingIcon?: ReactNode
  containerClassName?: string
}

// Keep native keyboard/mobile selection, with one consistently aligned arrow.
export function Select({ className, containerClassName, leadingIcon, children, ...props }: Props) {
  return (
    <div className={cn('relative inline-flex min-w-0 items-center', containerClassName)}>
      {leadingIcon && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 items-center justify-center"
        >
          {leadingIcon}
        </span>
      )}
      <select
        className={cn(
          'drive-field h-10 w-full appearance-none py-0 pl-3.5 pr-10 text-sm disabled:cursor-not-allowed disabled:opacity-50',
          leadingIcon && 'pl-9',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
        size={15}
      />
    </div>
  )
}
