import type { StepState } from '../../types/upload/step.ts'
import { CarUploadAndIpniCard } from './car-upload-and-ipni-card.tsx'
import { ProgressCard } from './progress-card.tsx'
import type { UploadStatusProps } from './upload-status.tsx'

interface UploadProgressProps {
  stepStates: Array<StepState>
  transactionHash?: UploadStatusProps['transactionHash']
  cid?: string
  fileName: string
}
function UploadProgress({ stepStates, transactionHash, cid, fileName }: UploadProgressProps) {
  const finalizingStep = stepStates.find((stepState) => stepState.step === 'finalizing-transaction')
  return (
    <>
      <CarUploadAndIpniCard cid={cid} fileName={fileName} stepStates={stepStates} />
      {finalizingStep && <ProgressCard stepState={finalizingStep} transactionHash={transactionHash} />}
    </>
  )
}

export { UploadProgress }
