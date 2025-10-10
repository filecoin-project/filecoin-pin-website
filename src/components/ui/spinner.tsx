interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: '1rem',
  md: '1.5rem',
  lg: '2rem',
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const spinnerSize = sizeMap[size]

  return (
    <output
      aria-label="Loading"
      aria-live="polite"
      className={`spinner ${className}`}
      style={{
        display: 'inline-block',
        width: spinnerSize,
        height: spinnerSize,
        border: '2px solid transparent',
        borderTop: '2px solid currentColor',
        borderRadius: '50%',
        animation: 'button-spin 1s linear infinite',
      }}
    />
  )
}
