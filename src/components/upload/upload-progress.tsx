import { useCallback } from 'react'
import { CardHeader, CardWrapper } from '../ui/card.tsx'
import { ProgressBar } from '../ui/progress-bar.tsx'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion.tsx'
import { BadgeStatus } from '../ui/badge-status.tsx'

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

export default function UploadProgress({ fileName, fileSize, progress }: UploadProgressProps) {
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

  return (
    <Accordion
      className="rounded-xl space-y-6 overflow-hidden border p-6 border-zinc-700"
      collapsible
      defaultValue="file-card"
      type="single"
    >
      <AccordionItem value="file-card">
        <div className="flex justify-between items-center">
          <div className="flex flex-col gap-1">
            <p className="text-white font-medium">{fileName}</p>
            <p className="text-zinc-400">{fileSize}</p>
          </div>
          <div className="flex items-center gap-6">
            {getCombinedFirstStageStatus() === 'completed' ? (
              <BadgeStatus status="pinned" />
            ) : (
              <BadgeStatus status={getCombinedFirstStageStatus()} />
            )}
            <AccordionTrigger />
          </div>
        </div>

        <AccordionContent className="space-y-6 mt-6">
          {/* Combined first stage: creating-car + checking-readiness + uploading-car */}
          {progress.find((p) => p.step === 'creating-car') && (
            <CardWrapper>
              <CardHeader
                estimatedTime={getCombinedFirstStageProgress()}
                status={getCombinedFirstStageStatus()}
                title={getStepLabel('creating-car')}
              />
              {getCombinedFirstStageStatus() === 'in-progress' && (
                <ProgressBar progress={getCombinedFirstStageProgress()} />
              )}
            </CardWrapper>
          )}

          {/* Show remaining steps individually */}
          {progress
            .filter(
              (step) =>
                step.step !== 'creating-car' && step.step !== 'checking-readiness' && step.step !== 'uploading-car'
            )
            .map((step) => {
              return (
                <CardWrapper key={step.step}>
                  <CardHeader status={step.status} title={getStepLabel(step.step)} />
                  {step.status === 'in-progress' && <ProgressBar progress={step.progress} />}
                  {step.error && <div className="error-message">{step.error}</div>}
                </CardWrapper>
              )
            })}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
