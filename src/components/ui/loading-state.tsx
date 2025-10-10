import { Spinner } from './spinner.tsx'

interface LoadingStateProps {
  message: string
  className?: string
}

export function LoadingState({ message, className = '' }: LoadingStateProps) {
  return (
    <div
      className={`loading-state ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        padding: '2rem',
        background: 'var(--color-background-elevated, #2a2a2a)',
        border: '1px solid var(--color-border, #3a3a3a)',
        borderRadius: '8px',
        marginBottom: '1.5rem',
      }}
    >
      <Spinner size="lg" />
      <p
        style={{
          margin: 0,
          color: 'var(--color-text-secondary, #999)',
          fontSize: '0.875rem',
        }}
      >
        {message}
      </p>
    </div>
  )
}
