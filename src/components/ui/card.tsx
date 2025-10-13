import type { UploadProgress } from '../upload/upload-progress.tsx'
import { BadgeStatus } from './badge-status.tsx'
import { Heading } from './heading.tsx'
import { Spinner } from './spinner.tsx'

type CardWrapperProps = {
  children: React.ReactNode
}

type CardHeaderProps = {
  title: string
  status: UploadProgress['status']
  estimatedTime?: string
  hideSpinner?: boolean
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

function CardHeader({ title, status, estimatedTime, hideSpinner }: CardHeaderProps) {
  const isInProgress = status === 'in-progress'
  const showSpinner = isInProgress && !hideSpinner

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {showSpinner && <Spinner />}
        <Heading tag="h4">{title}</Heading>
      </div>

      <span aria-live="polite" className="text-sm text-right text-zinc-400" hidden={!isInProgress}>
        {estimatedTime}
      </span>

      <div hidden={isInProgress}>
        <BadgeStatus status={status} />
      </div>
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
