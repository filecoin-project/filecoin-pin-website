import type { UploadProgress } from '../upload/upload-progress.tsx'
import { BadgeStatus } from './badge-status.tsx'

type CardWrapperProps = {
  children: React.ReactNode
}

type CardHeaderProps = {
  title: string
  status: UploadProgress['status']
  estimatedTime?: string
}

type CardContentProps = {
  children: React.ReactNode
}

function CardWrapper({ children }: CardWrapperProps) {
  return <div className="bg-zinc-900 p-6 rounded-lg">{children}</div>
}

function CardHeader({ title, status }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-medium">{title}</h3>
      {status !== 'in-progress' && <BadgeStatus status={status} />}
    </div>
  )
}

function CardContent({ children }: CardContentProps) {
  return <div className="p-6 border border-zinc-800 rounded-md">{children}</div>
}

export { CardWrapper, CardHeader, CardContent }
