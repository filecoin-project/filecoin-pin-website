import { Spinner } from './spinner.tsx'

interface LoadingStateProps {
  message: string
  className?: string
}

export function LoadingState({ message, className = '' }: LoadingStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-4 p-8 bg-zinc-900 border border-zinc-700 rounded-lg mb-6 ${className}`}
    >
      <Spinner size="xl" />
      <p className="m-0 text-zinc-400 text-sm">{message}</p>
    </div>
  )
}
