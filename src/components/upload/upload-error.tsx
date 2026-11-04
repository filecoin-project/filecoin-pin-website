import type { useUploadOrchestration } from '../../hooks/use-upload-orchestration.ts'
import { Alert } from '../ui/alert.tsx'

interface UploadErrorProps {
  orchestration: ReturnType<typeof useUploadOrchestration>
}

function UploadError({ orchestration }: UploadErrorProps) {
  const {
    activeUpload,
    uploadedFile,
    retryUpload,
    cancelUpload,
    directorySaveError,
    isSavingDirectory,
    retryDirectorySave,
  } = orchestration

  if (directorySaveError) {
    return (
      <Alert
        button={{
          children: isSavingDirectory ? 'Saving…' : 'Retry saving',
          onClick: retryDirectorySave,
          disabled: isSavingDirectory,
        }}
        description={directorySaveError}
        message={
          activeUpload.isUploading
            ? 'File directory not saved'
            : 'Stored file details could not be saved in this browser'
        }
        variant="error"
      />
    )
  }

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
