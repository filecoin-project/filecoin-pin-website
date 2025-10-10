import { Loader2Icon } from 'lucide-react'

import { cn } from '../../utils/cn.ts'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return <Loader2Icon aria-label="Loading" role="status" {...props} className={cn('size-4 animate-spin', className)} />
}

export { Spinner }
