type ProgressBarProps = {
  progress: number
}

function ProgressBar({ progress }: ProgressBarProps) {
  if (progress < 0 || progress > 100) {
    console.error('ProgressBar: progress must be between 0 and 100, received:', progress)
  }

  return (
    <div className="flex items-center">
      <div className="flex-1 h-1.5 bg-brand-950 rounded-full overflow-hidden">
        <div
          className="bg-brand-700 h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export { ProgressBar }
