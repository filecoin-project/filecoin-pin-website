import { CircleCheck, LoaderCircle } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn.ts'
import type { UploadProgress } from '../upload/upload-progress.tsx'

type BadgeStatus = UploadProgress['status'] | 'pinned'

type BadgeStatusProps = VariantProps<typeof badgeVariants> & {
  mode: BadgeStatus
}

const badgeVariants = cva('inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full text-sm font-medium', {
  variants: {
    status: {
      'in-progress': 'bg-badge-in-progress text-badge-in-progress-text border border-badge-in-progress-border',
      completed: 'bg-badge-success text-brand-50 border border-badge-success-border',
      pinned: 'bg-badge-success text-brand-50 border border-badge-success-border',
      error: null,
      pending: 'bg-zinc-800 border border-zinc-700 text-zinc-300',
    },
  },
  defaultVariants: {
    status: 'in-progress',
  },
})

const statusIcons: Record<BadgeStatus, React.ReactNode> = {
  'in-progress': <LoaderCircle size={12} />,
  completed: <CircleCheck size={12} />,
  pinned: <CircleCheck size={12} />,
  error: null,
  pending: null,
}

const statusLabels: Record<BadgeStatus, string | null> = {
  'in-progress': 'In progress',
  completed: 'Complete',
  pinned: 'Pinned',
  error: null,
  pending: 'Pending',
}

function BadgeStatus({ mode }: BadgeStatusProps) {
  return (
    <span className={cn(badgeVariants({ status: mode }))}>
      {statusIcons[mode]} {statusLabels[mode]}
    </span>
  )
}

export { BadgeStatus }
