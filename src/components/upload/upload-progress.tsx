import { COMBINED_STEPS } from '../../constants/upload-status.tsx'
import type { Progress } from '../../types/upload-progress.ts'
import { ProgressCard } from './progress-card.tsx'
import { ProgressCardCombined } from './progress-card-combined.tsx'

interface UploadProgressProps {
  progresses: Array<Progress>
  transactionHash?: string
  getCombinedFirstStageStatus: () => Progress['status']
  getCombinedFirstStageProgress: () => number
}
function UploadProgress({
  progresses,
  transactionHash,
  getCombinedFirstStageStatus,
  getCombinedFirstStageProgress,
}: UploadProgressProps) {
  return (
    <>
      <ProgressCardCombined
        getCombinedFirstStageProgress={getCombinedFirstStageProgress}
        getCombinedFirstStageStatus={getCombinedFirstStageStatus}
        progresses={progresses}
      />

      {progresses
        .filter((progress) => !COMBINED_STEPS.includes(progress.step))
        .map((progress) => (
          <ProgressCard key={progress.step} progress={progress} transactionHash={transactionHash} />
        ))}
    </>
  )
}

export { UploadProgress }
