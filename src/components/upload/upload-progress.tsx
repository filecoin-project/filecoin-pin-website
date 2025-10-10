import { useCallback } from 'react'
import './upload-progress.css'
import { CardHeader, CardWrapper } from '../ui/card.tsx'

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

export default function UploadProgress({
  fileName,
  fileSize,
  progress,
  isExpanded = true,
  onToggleExpanded,
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

  return (
    <div className="upload-progress-container">
      <div className="upload-header">
        <h2>Uploaded files</h2>
      </div>

      <div className="file-card">
        <div className="file-card-header">
          <div className="file-info">
            <div className="file-name">{fileName}</div>
            <div className="file-size">{fileSize}</div>
          </div>
          <div className="file-card-actions">
            <span className="status-badge in-progress">In progress</span>
            {onToggleExpanded && (
              <button className="expand-button" onClick={onToggleExpanded} type="button">
                {isExpanded ? '⌄' : '⌃'}
              </button>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="progress-steps">
            {/* Combined first stage: creating-car + checking-readiness + uploading-car */}
            {progress.find((p) => p.step === 'creating-car') && (
              <CardWrapper>
                <div className="step-content">
                  <CardHeader status={getCombinedFirstStageStatus()} title={getStepLabel('creating-car')} />
                  {getCombinedFirstStageStatus() === 'in-progress' && (
                    <div className="progress-bar-container">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${getCombinedFirstStageProgress()}%` }} />
                      </div>
                      <span className="progress-text">{getCombinedFirstStageProgress()}%</span>
                    </div>
                  )}
                </div>
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
                    <div className="step-content">
                      <CardHeader status={step.status} title={getStepLabel(step.step)} />
                      {step.status === 'in-progress' && (
                        <div className="progress-bar-container">
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${step.progress}%` }} />
                          </div>
                          <span className="progress-text">{step.progress}%</span>
                        </div>
                      )}
                      {step.error && <div className="error-message">{step.error}</div>}
                    </div>
                  </CardWrapper>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
