type ProgressBarProps = {
  progress: number
}

function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="flex items-center">
      <div className="flex-1 h-1.5 bg-brand-100 rounded-full overflow-hidden">
        <div
          className="bg-brand-50 h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export { ProgressBar }
