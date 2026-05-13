import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangle, CircleCheck } from 'lucide-react'
import { cn } from '../../utils/cn.ts'

type ReplicationLevel = 'replicated' | 'degraded'

type BadgeReplicationProps = VariantProps<typeof badgeVariants> & {
  copyCount: number
}

const badgeVariants = cva(
  'inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full text-sm font-medium flex-shrink-0',
  {
    variants: {
      level: {
        replicated: 'text-green-300 bg-green-950/60 border border-green-900/40',
        degraded: 'text-yellow-200 bg-yellow-600/30 border border-yellow-400/20',
      },
    },
  }
)

const levelIcons: Record<ReplicationLevel, React.ReactNode> = {
  replicated: <CircleCheck size={12} />,
  degraded: <AlertTriangle size={12} />,
}

function BadgeReplication({ copyCount }: BadgeReplicationProps) {
  if (copyCount <= 0) {
    return null
  }

  const level: ReplicationLevel = copyCount >= 2 ? 'replicated' : 'degraded'
  const label = copyCount >= 2 ? `${copyCount}x replicated` : '1 copy'

  return (
    <span className={cn(badgeVariants({ level }))}>
      {levelIcons[level]} {label}
    </span>
  )
}

export { BadgeReplication }
