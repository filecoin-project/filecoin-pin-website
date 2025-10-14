import type { Progress } from '../../types/upload-progress.ts'
import { CarUploadAndIpniCard } from './car-upload-and-ipni-card.tsx'
import { ProgressCard } from './progress-card.tsx'

interface UploadProgressProps {
  progresses: Array<Progress>
  transactionHash?: string
  getCombinedFirstStageStatus: () => Progress['status']
  getCombinedFirstStageProgress: () => number
  cid?: string
  hasIpniFailure?: boolean
}
function UploadProgress({
  progresses,
  transactionHash,
  getCombinedFirstStageStatus,
  getCombinedFirstStageProgress,
  cid,
  hasIpniFailure,
}: UploadProgressProps) {
  const finalizingStep = progresses.find((p) => p.step === 'finalizing-transaction')
  return (
    <>
      <CarUploadAndIpniCard
        cid={cid}
        getCombinedFirstStageProgress={getCombinedFirstStageProgress}
        getCombinedFirstStageStatus={getCombinedFirstStageStatus}
        hasIpniFailure={hasIpniFailure}
        progresses={progresses}
      />
      {finalizingStep && <ProgressCard progress={finalizingStep} transactionHash={transactionHash} />}
    </>
  )
}

export { UploadProgress }
