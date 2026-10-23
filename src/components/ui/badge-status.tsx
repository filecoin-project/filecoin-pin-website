import { cva, type VariantProps } from 'class-variance-authority'
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react'
import type { StepState } from '../../types/upload/step.ts'
import { cn } from '../../utils/cn.ts'

export type Status = StepState['status'] | 'pinned' | 'published'

type BadgeStatusProps = VariantProps<typeof badgeVariants> & {
  status: Status
}

const badgeVariants = cva(
  'inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full text-sm font-medium flex-shrink-0',
  {
    variants: {
      status: {
        'in-progress': 'bg-badge-in-progress text-badge-in-progress-text border border-badge-in-progress-border',
        completed: 'bg-badge-completed text-badge-completed-text border border-badge-completed-border',
        pinned: 'bg-badge-completed text-badge-completed-text border border-badge-completed-border',
        published: 'bg-amber-500/10 border border-amber-500/25 text-warning',
        error: 'bg-red-500/10 border border-red-500/25 text-danger',
        pending: 'bg-surface-raised border border-border text-foreground',
      },
    },
    defaultVariants: {
      status: 'in-progress',
    },
  }
)

const statusIcons: Record<Status, React.ReactNode> = {
  'in-progress': <LoaderCircle className="animate-spin" size={12} />,
  completed: <CircleCheck size={12} />,
  pinned: <CircleCheck size={12} />,
  published: null,
  error: <CircleAlert size={12} />,
  pending: null,
}

const statusLabels: Record<Status, string | null> = {
  'in-progress': 'In progress',
  completed: 'Complete',
  pinned: 'Pinned',
  published: 'Published',
  error: 'Failed',
  pending: 'Pending',
}

function BadgeStatus({ status }: BadgeStatusProps) {
  return (
    <span className={cn(badgeVariants({ status }))}>
      {statusIcons[status]} {statusLabels[status]}
    </span>
  )
}

export { BadgeStatus }
