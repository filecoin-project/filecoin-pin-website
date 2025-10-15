import type { Progress } from '../../types/upload-progress.ts'
import { CarUploadAndIpniCard } from './car-upload-and-ipni-card.tsx'
import { ProgressCard } from './progress-card.tsx'
import type { UploadStatusProps } from './upload-status.tsx'

interface UploadProgressProps {
  progresses: Array<Progress>
  transactionHash?: UploadStatusProps['transactionHash']
  cid?: string
  fileName: string
}
function UploadProgress({ progresses, transactionHash, cid, fileName }: UploadProgressProps) {
  const finalizingStep = progresses.find((p) => p.step === 'finalizing-transaction')
  return (
    <>
      <CarUploadAndIpniCard cid={cid} fileName={fileName} progresses={progresses} />
      {finalizingStep && <ProgressCard progress={finalizingStep} transactionHash={transactionHash} />}
    </>
  )
}

export { UploadProgress }
