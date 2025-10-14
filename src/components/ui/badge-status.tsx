import { cva, type VariantProps } from 'class-variance-authority'
import { CircleCheck, LoaderCircle } from 'lucide-react'
import { cn } from '../../utils/cn.ts'
import type { UploadProgress } from '../upload/upload-status.tsx'

export type Status = UploadProgress['status'] | 'pinned'

type BadgeStatusProps = VariantProps<typeof badgeVariants> & {
  status: Status
}

const badgeVariants = cva('inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full text-sm font-medium', {
  variants: {
    status: {
      'in-progress': 'bg-badge-in-progress text-badge-in-progress-text border border-badge-in-progress-border',
      completed: 'bg-brand-950 text-brand-700 border border-brand-900',
      pinned: 'bg-brand-950 text-brand-700 border border-brand-900',
      error: null,
      pending: 'bg-zinc-800 border border-zinc-700 text-zinc-300',
    },
  },
  defaultVariants: {
    status: 'in-progress',
  },
})

const statusIcons: Record<Status, React.ReactNode> = {
  'in-progress': <LoaderCircle size={12} />,
  completed: <CircleCheck size={12} />,
  pinned: <CircleCheck size={12} />,
  error: null,
  pending: null,
}

const statusLabels: Record<Status, string | null> = {
  'in-progress': 'In progress',
  completed: 'Complete',
  pinned: 'Pinned',
  error: null,
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
