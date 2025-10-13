import type { UploadProgress } from '../upload/upload-progress.tsx'
import { BadgeStatus } from './badge-status.tsx'
import { Heading } from './heading.tsx'

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

type CardInfoRowProps = {
  title: string
  subtitle: React.ReactNode
  children?: React.ReactNode
}

function CardWrapper({ children }: CardWrapperProps) {
  return <div className="bg-zinc-900 p-6 rounded-lg space-y-6">{children}</div>
}

function CardHeader({ title, status, estimatedTime }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <Heading tag="h4">{title}</Heading>
      {status === 'in-progress' && estimatedTime && <span className="text-sm text-zinc-400">{estimatedTime}</span>}
      {status !== 'in-progress' && <BadgeStatus status={status} />}
    </div>
  )
}

function CardContent({ children }: CardContentProps) {
  return <div className="p-5 border border-zinc-800 rounded-md">{children}</div>
}

function CardInfoRow({ title, subtitle, children }: CardInfoRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-2 text-base">
        <Heading tag="h4">{title}</Heading>
        <p>{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

const Card = {
  Wrapper: CardWrapper,
  Header: CardHeader,
  Content: CardContent,
  InfoRow: CardInfoRow,
}

export { Card }
