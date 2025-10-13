import { useCallback } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion.tsx'
import { ButtonLink } from '../ui/button/button-link.tsx'
import { Card } from '../ui/card.tsx'
import { DownloadButton } from '../ui/download-button.tsx'
import { FileInfo } from '../ui/file-info.tsx'
import { ProgressBar } from '../ui/progress-bar.tsx'
import { TextWithCopyToClipboard } from '../ui/text-with-copy-to-clipboard.tsx'
import { Alert } from '@/components/ui/alert.tsx'

export interface UploadProgress {
  step: 'creating-car' | 'uploading-car' | 'checking-readiness' | 'announcing-cids' | 'finalizing-transaction'
  progress: number // 0-100
  status: 'pending' | 'in-progress' | 'completed' | 'error'
  error?: string
}

interface UploadProgressProps {
  fileName: string
  fileSize: string
  progress: UploadProgress[]
  isExpanded?: boolean
  onToggleExpanded?: () => void
  cid?: string
  pieceCid?: string
  providerName?: string
  transactionHash?: string
  network?: string
}

// simple type to help with searching for UploadProgress['step'] in the first step group
const firstStepGroup: Record<
  'creatingCar' | 'checkingReadiness' | 'uploadingCar',
  { progress: number; status: UploadProgress['status'] }
> = {
  creatingCar: { progress: 0, status: 'pending' },
  checkingReadiness: { progress: 0, status: 'pending' },
  uploadingCar: { progress: 0, status: 'pending' },
} as const

const createStepGroup = (progress: UploadProgress[]) => {
  // Map kebab-case step names to camelCase keys
  const stepMap: Record<string, keyof typeof firstStepGroup> = {
    'creating-car': 'creatingCar',
    'checking-readiness': 'checkingReadiness',
    'uploading-car': 'uploadingCar',
  }

  return progress.reduce<typeof firstStepGroup>(
    (acc, p) => {
      const key = stepMap[p.step]
      if (key) {
        acc[key] = { progress: p.progress, status: p.status }
      }
      return acc
    },
    {
      creatingCar: { progress: 0, status: 'pending' },
      checkingReadiness: { progress: 0, status: 'pending' },
      uploadingCar: { progress: 0, status: 'pending' },
    }
  )
}

export default function UploadProgress({
  fileName,
  fileSize,
  progress,
  isExpanded = true,
  onToggleExpanded,
  cid,
  pieceCid,
  providerName,
  transactionHash,
  network,
}: UploadProgressProps) {
  // Calculate combined progress for the first stage (creating CAR + checking readiness + uploading)
  const getCombinedFirstStageProgress = useCallback(() => {
    const { creatingCar, checkingReadiness, uploadingCar } = createStepGroup(progress)
    const total = creatingCar.progress + checkingReadiness.progress + uploadingCar.progress
    return Math.round(total / 3)
  }, [progress])

  // Get the status for the combined first stage
  const getCombinedFirstStageStatus = useCallback((): UploadProgress['status'] => {
    const { creatingCar, checkingReadiness, uploadingCar } = createStepGroup(progress)
    // If any stage has error, show error
    if (uploadingCar?.status === 'error' || checkingReadiness?.status === 'error' || creatingCar?.status === 'error') {
      return 'error'
    }

    // If uploading-car is completed, the whole stage is completed
    if (uploadingCar?.status === 'completed') {
      return 'completed'
    }

    // If any stage is in progress OR completed (but not all completed), show in-progress
    const startedStages: UploadProgress['status'][] = ['in-progress', 'completed']
    const hasStarted =
      (uploadingCar?.status && startedStages.includes(uploadingCar.status)) ||
      (checkingReadiness?.status && startedStages.includes(checkingReadiness.status)) ||
      (creatingCar?.status && startedStages.includes(creatingCar.status))

    if (hasStarted) {
      return 'in-progress'
    }

    // Otherwise pending
    return 'pending'
  }, [progress])

  const getStepLabel = (step: UploadProgress['step']) => {
    switch (step) {
      case 'creating-car':
      case 'checking-readiness':
      case 'uploading-car':
        return 'Creating CAR and uploading to the Filecoin SP'
      case 'announcing-cids':
        return 'Announcing IPFS CIDs to IPNI'
      case 'finalizing-transaction':
        return 'Finalizing storage transaction on Calibration testnet'
    }
  }

  const getEstimatedTime = (step: UploadProgress['step']) => {
    switch (step) {
      case 'creating-car':
      case 'checking-readiness':
      case 'uploading-car':
        return 'Estimated time: ~30 seconds'
      case 'announcing-cids':
        return 'Estimated time: ~30 seconds'
      case 'finalizing-transaction':
        return 'Estimated time: ~30-60 seconds'
    }
  }

  // Check if all steps are completed AND we have a CID (upload actually finished)
  const isCompleted = progress.every((p) => p.status === 'completed') && !!cid

  // Check if any step is in error
  const hasError = progress.some((p) => p.status === 'error')

  // Determine the badge status for the file card header
  const getBadgeStatus = () => {
    if (isCompleted) return 'pinned'
    if (hasError) return 'error'
    // Check if any step is in progress
    if (progress.some((p) => p.status === 'in-progress')) return 'in-progress'
    // If no steps are in progress but not all completed, must be pending
    return 'pending'
  }

  return (
    <Accordion
      className="rounded-xl space-y-6 overflow-hidden border p-6 border-zinc-700"
      collapsible
      onValueChange={onToggleExpanded ? () => onToggleExpanded() : undefined}
      type="single"
      value={isExpanded ? 'file-card' : ''}
    >
      <AccordionItem value="file-card">
        <FileInfo badgeStatus={getBadgeStatus()} fileName={fileName} fileSize={fileSize}>
          <AccordionTrigger />
        </FileInfo>

        <AccordionContent className="space-y-6 mt-6">
          {/* Show progress steps only when not completed */}
          {!isCompleted && (
            <>
              {/* Combined first stage: creating-car + checking-readiness + uploading-car */}
              {progress.find((p) => p.step === 'creating-car') && (
                <Card.Wrapper>
                  <Card.Header
                    estimatedTime={getEstimatedTime('creating-car')}
                    status={getCombinedFirstStageStatus()}
                    title={getStepLabel('creating-car')}
                  />
                  {getCombinedFirstStageStatus() === 'in-progress' && (
                    <ProgressBar progress={getCombinedFirstStageProgress()} />
                  )}
                </Card.Wrapper>
              )}

              {/* Show remaining steps individually */}
              {progress
                .filter(
                  (step) =>
                    step.step !== 'creating-car' && step.step !== 'checking-readiness' && step.step !== 'uploading-car'
                )
                .map((step) => {
                  return (
                    <Card.Wrapper key={step.step}>
                      <Card.Header
                        estimatedTime={getEstimatedTime(step.step)}
                        status={step.status}
                        title={getStepLabel(step.step)}
                        withSpinner
                      />

                      {step.error && <Alert message={step.error} variant="error" />}

                      {/* Show transaction hash in the finalizing step */}
                      {step.step === 'finalizing-transaction' && transactionHash && (
                        <Card.Content>
                          <TextWithCopyToClipboard
                            href={`https://filecoin-testnet.blockscout.com/tx/${transactionHash}`}
                            text={transactionHash}
                          />
                        </Card.Content>
                      )}
                    </Card.Wrapper>
                  )
                })}
            </>
          )}

          {/* Completed state - show CIDs and provider info */}
          {isCompleted && cid && (
            <>
              <Card.Wrapper>
                <Card.InfoRow
                  subtitle={<TextWithCopyToClipboard href={`https://dweb.link/ipfs/${cid}`} text={cid} />}
                  title="IPFS Root CID"
                >
                  <DownloadButton href={`https://dweb.link/ipfs/${cid}`} />
                </Card.InfoRow>
              </Card.Wrapper>

              {pieceCid && (
                <Card.Wrapper>
                  <Card.InfoRow
                    subtitle={
                      <TextWithCopyToClipboard
                        href={`https://pdp.vxb.ai/${network || 'calibration'}/piece/${pieceCid}`}
                        text={pieceCid}
                      />
                    }
                    title="Filecoin Piece CID"
                  >
                    <DownloadButton href={`https://pdp.vxb.ai/${network || 'calibration'}/piece/${pieceCid}`} />
                  </Card.InfoRow>
                </Card.Wrapper>
              )}
              {providerName && (
                <Card.Wrapper>
                  <Card.InfoRow
                    subtitle={
                      <a
                        className="text-brand-500"
                        href={`https://filfox.info/en/address/${providerName}`}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {providerName}
                      </a>
                    }
                    title="Provider"
                  >
                    <ButtonLink href={'#'}>View proofs</ButtonLink>
                  </Card.InfoRow>
                </Card.Wrapper>
              )}
            </>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
