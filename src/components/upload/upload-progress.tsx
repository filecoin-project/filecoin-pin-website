import type { Progress } from '../../types/upload-progress.ts'
import { CarUploadAndIpniCard } from './car-upload-and-ipni-card.tsx'
import { ProgressCard } from './progress-card.tsx'
import type { UploadStatusProps } from './upload-status.tsx'

interface UploadProgressProps {
  progresses: Array<Progress>
  transactionHash?: UploadStatusProps['transactionHash']
  getCombinedFirstStageStatus: () => Progress['status']
  getCombinedFirstStageProgress: () => number
  cid?: string
  fileName: string
  hasIpniFailure?: boolean
}
function UploadProgress({
  progresses,
  transactionHash,
  getCombinedFirstStageStatus,
  getCombinedFirstStageProgress,
  cid,
  fileName,
  hasIpniFailure,
}: UploadProgressProps) {
  const finalizingStep = progresses.find((p) => p.step === 'finalizing-transaction')
  return (
    <>
      <CarUploadAndIpniCard
        cid={cid}
        fileName={fileName}
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
