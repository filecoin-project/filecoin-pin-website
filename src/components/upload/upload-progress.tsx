import type { StepState } from '../../types/upload/step.ts'
import { CarUploadAndIpniCard } from './car-upload-and-ipni-card.tsx'
import { ProgressCard } from './progress-card.tsx'
import type { UploadStatusProps } from './upload-status.tsx'

interface UploadProgressProps {
  stepStates: Array<StepState>
  transactionHash?: UploadStatusProps['transactionHash']
  transactionHashes?: string[]
  confirmedCopies?: number
  expectedCopies?: number
  cid?: string
  fileName: string
  network?: string
}
function UploadProgress({
  stepStates,
  transactionHash,
  transactionHashes,
  confirmedCopies,
  expectedCopies,
  cid,
  fileName,
  network,
}: UploadProgressProps) {
  const finalizingStep = stepStates.find((stepState) => stepState.step === 'finalizing-transaction')
  return (
    <>
      <CarUploadAndIpniCard cid={cid} fileName={fileName} stepStates={stepStates} />
      {finalizingStep && (
        <ProgressCard
          confirmedCopies={confirmedCopies}
          expectedCopies={expectedCopies}
          network={network}
          stepState={finalizingStep}
          transactionHash={transactionHash}
          transactionHashes={transactionHashes}
        />
      )}
    </>
  )
}

export { UploadProgress }
