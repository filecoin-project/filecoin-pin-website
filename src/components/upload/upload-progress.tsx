import { useCallback } from 'react'
import './upload-progress.css'

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

  const getStepIcon = (step: UploadProgress['step']) => {
    switch (step) {
      case 'creating-car':
      case 'checking-readiness':
      case 'uploading-car':
        return 'C'
      case 'announcing-cids':
        return 'I'
      case 'finalizing-transaction':
        return 'R'
    }
  }

  const getStatusBadge = (status: UploadProgress['status']) => {
    switch (status) {
      case 'pending':
        return <span className="status-badge pending">Pending</span>
      case 'in-progress':
        return <span className="status-badge in-progress">In progress</span>
      case 'completed':
        return <span className="status-badge completed">Completed</span>
      case 'error':
        return <span className="status-badge error">Error</span>
    }
  }

  // Check if all steps are completed AND we have a CID (upload actually finished)
  const isCompleted = progress.every((p) => p.status === 'completed') && !!cid

  // Check if any step is in error
  const hasError = progress.some((p) => p.status === 'error')

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
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
            {isCompleted ? (
              <span className="status-badge completed">✓ Pinned</span>
            ) : hasError ? (
              <span className="status-badge error">Error</span>
            ) : (
              <span className="status-badge in-progress">In progress</span>
            )}
            {onToggleExpanded && (
              <button className="expand-button" onClick={onToggleExpanded} type="button">
                {isExpanded ? '⌄' : '⌃'}
              </button>
            )}
          </div>
        </div>

        {isExpanded && !isCompleted && (
          <div className="progress-steps">
            {/* Combined first stage: creating-car + checking-readiness + uploading-car */}
            {progress.find((p) => p.step === 'creating-car') && (
              <div className={`progress-step ${getCombinedFirstStageStatus()}`} key="combined-upload">
                <div className="step-icon">{getStepIcon('creating-car')}</div>
                <div className="step-content">
                  <div className="step-header">
                    <span className="step-label">{getStepLabel('creating-car')}</span>
                    {getStatusBadge(getCombinedFirstStageStatus())}
                  </div>
                  {getCombinedFirstStageStatus() === 'in-progress' && (
                    <div className="progress-bar-container">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${getCombinedFirstStageProgress()}%` }} />
                      </div>
                      <span className="progress-text">{getCombinedFirstStageProgress()}%</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Show remaining steps individually */}
            {progress
              .filter(
                (step) =>
                  step.step !== 'creating-car' && step.step !== 'checking-readiness' && step.step !== 'uploading-car'
              )
              .map((step) => (
                <div className={`progress-step ${step.status}`} key={step.step}>
                  <div className="step-icon">{getStepIcon(step.step)}</div>
                  <div className="step-content">
                    <div className="step-header">
                      <span className="step-label">{getStepLabel(step.step)}</span>
                      {getStatusBadge(step.status)}
                    </div>
                    {step.status === 'in-progress' && (
                      <div className="progress-bar-container">
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${step.progress}%` }} />
                        </div>
                        <span className="progress-text">{step.progress}%</span>
                      </div>
                    )}
                    {step.error && <div className="error-message">{step.error}</div>}

                    {/* Show transaction hash in the finalizing step */}
                    {step.step === 'finalizing-transaction' && transactionHash && (
                      <div className="transaction-hash-section">
                        <div className="transaction-hash-label">Transaction hash</div>
                        <div className="transaction-hash-value">
                          <a
                            className="transaction-hash-link"
                            href={`https://calibration.filfox.info/en/message/${transactionHash}`}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            {transactionHash}
                          </a>
                          <button
                            className="copy-button"
                            onClick={() => copyToClipboard(transactionHash)}
                            title="Copy to clipboard"
                            type="button"
                          >
                            📋
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Completed state - show CIDs and provider info */}
        {isExpanded && isCompleted && cid && (
          <div className="completed-details">
            <div className="detail-section">
              <div className="detail-label">IPFS Root CID</div>
              <div className="detail-value">
                <a
                  className="cid-link"
                  href={`https://dweb.link/ipfs/${cid}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {cid}
                </a>
                <button
                  className="copy-button"
                  onClick={() => copyToClipboard(cid)}
                  title="Copy to clipboard"
                  type="button"
                >
                  📋
                </button>
                <a
                  className="download-button"
                  href={`https://dweb.link/ipfs/${cid}`}
                  rel="noopener noreferrer"
                  target="_blank"
                  title="Download"
                >
                  ⬇️
                </a>
              </div>
            </div>

            {pieceCid && (
              <div className="detail-section">
                <div className="detail-label">Filecoin Piece CID</div>
                <div className="detail-value">
                  <span className="piece-cid">{pieceCid}</span>
                  <button
                    className="copy-button"
                    onClick={() => copyToClipboard(pieceCid)}
                    title="Copy to clipboard"
                    type="button"
                  >
                    📋
                  </button>
                  <a
                    className="download-button"
                    href={`https://pdp.vxb.ai/${network || 'calibration'}/piece/${pieceCid}`}
                    rel="noopener noreferrer"
                    target="_blank"
                    title="View on PDP Explorer"
                  >
                    ⬇️
                  </a>
                </div>
              </div>
            )}

            {providerName && (
              <div className="detail-section">
                <div className="detail-label">Provider</div>
                <div className="detail-value">
                  <a
                    className="provider-link"
                    href={`https://filfox.info/en/address/${providerName}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {providerName}
                  </a>
                </div>
              </div>
            )}

            <div className="completed-actions">
              <button className="view-proofs-button" type="button">
                View proofs
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
