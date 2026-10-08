import { Spinner } from './spinner.tsx'

interface LoadingStateProps {
  message: string
  className?: string
}

export function LoadingState({ message, className = '' }: LoadingStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-4 p-8 bg-surface border border-border rounded-lg mb-6 ${className}`}
    >
      <Spinner size="xl" />
      <p className="m-0 text-muted text-sm">{message}</p>
    </div>
  )
}
