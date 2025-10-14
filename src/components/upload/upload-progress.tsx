import { COMBINED_STEPS } from '../../constants/upload-status.tsx'
import type { Progress } from '../../types/upload-progress.ts'
import { ProgressCard } from './progress-card.tsx'
import { ProgressCardCombined } from './progress-card-combined.tsx'

interface UploadProgressProps {
  progress: Progress[]
  transactionHash?: string
  getCombinedFirstStageStatus: () => Progress['status']
  getCombinedFirstStageProgress: () => number
}
function UploadProgress({
  progress,
  transactionHash,
  getCombinedFirstStageStatus,
  getCombinedFirstStageProgress,
}: UploadProgressProps) {
  return (
    <>
      <ProgressCardCombined
        getCombinedFirstStageProgress={getCombinedFirstStageProgress}
        getCombinedFirstStageStatus={getCombinedFirstStageStatus}
        progress={progress}
      />

      {progress
        .filter((step) => !COMBINED_STEPS.includes(step.step))
        .map((step) => (
          <ProgressCard key={step.step} step={step} transactionHash={transactionHash} />
        ))}
    </>
  )
}

export { UploadProgress }
