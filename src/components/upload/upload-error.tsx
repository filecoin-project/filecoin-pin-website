import type { useUploadOrchestration } from '../../hooks/use-upload-orchestration.ts'
import { Alert } from '../ui/alert.tsx'

interface UploadErrorProps {
  orchestration: ReturnType<typeof useUploadOrchestration>
}

function UploadError({ orchestration }: UploadErrorProps) {
  const { activeUpload, uploadedFile, retryUpload, cancelUpload } = orchestration

  if (!activeUpload.error) {
    return null
  }

  return (
    <Alert
      button={{ children: 'Retry Upload', onClick: retryUpload }}
      cancelButton={{ children: 'Cancel', onClick: cancelUpload }}
      description={activeUpload.error}
      message={`Upload failed - ${uploadedFile?.file.name}`}
      variant="error"
    />
  )
}

export { UploadError }
