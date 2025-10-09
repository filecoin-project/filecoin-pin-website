import './upload-progress.css'

export interface UploadProgress {
  step: 'creating-car' | 'announcing-cids' | 'finalizing-transaction'
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

export default function UploadProgress({
  fileName,
  fileSize,
  progress,
  isExpanded = true,
  onToggleExpanded,
}: UploadProgressProps) {
  const getStepLabel = (step: UploadProgress['step']) => {
    switch (step) {
      case 'creating-car':
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
            {progress.map((step, _index) => (
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
