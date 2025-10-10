import type { UploadProgress } from '../upload/upload-progress.tsx'
import { BadgeStatus } from './badge-status.tsx'
import { Spinner } from './spinner.tsx'

type CardWrapperProps = {
  children: React.ReactNode
}

type CardHeaderProps = {
  title: string
  status: UploadProgress['status']
  hideSpinner?: true
  estimatedTime?: string
}

type CardContentProps = {
  children: React.ReactNode
}

function CardWrapper({ children }: CardWrapperProps) {
  return <div className="bg-zinc-900 p-6 rounded-lg space-y-6">{children}</div>
}

function CardHeader({ title, status, hideSpinner, estimatedTime }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {status === 'in-progress' && !hideSpinner && <Spinner className="text-brand-700" />}
        <h3 className="font-medium">{title}</h3>
      </div>
      {status === 'in-progress' && <span className="text-sm text-right text-zinc-400">{estimatedTime}</span>}
      {status !== 'in-progress' && <BadgeStatus status={status} />}
    </div>
  )
}

function CardContent({ children }: CardContentProps) {
  return <div className="p-6 border border-zinc-800 rounded-md">{children}</div>
}

export { CardWrapper, CardHeader, CardContent }
