import { AlertTriangle } from 'lucide-react'
import type { useUploadOrchestration } from '../../hooks/use-upload-orchestration.ts'
import { ButtonBase } from '../ui/button/button-base.tsx'

interface UploadErrorProps {
  orchestration: ReturnType<typeof useUploadOrchestration>
}

function UploadError({ orchestration }: UploadErrorProps) {
  const { activeUpload, uploadedFile, retryUpload, cancelUpload } = orchestration

  if (!activeUpload.error) {
    return null
  }

  return (
    <div className="bg-red-950/60 border border-red-900/40 flex flex-col gap-4 p-4 rounded-xl" role="alert">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="text-red-300">
          <AlertTriangle size={22} />
        </span>
        <div className="flex-1">
          <h3 className="text-red-300 font-semibold mb-1">Upload Failed</h3>
          {uploadedFile && <p className="text-red-200 text-sm mb-2">{uploadedFile.file.name}</p>}
          <p className="text-red-300">{activeUpload.error}</p>
        </div>
      </div>
      <div className="flex gap-4 justify-end">
        <ButtonBase onClick={cancelUpload} type="button" variant="secondary">
          Cancel
        </ButtonBase>
        <ButtonBase
          className="bg-red-700 hover:bg-red-600 hover:opacity-100"
          onClick={retryUpload}
          type="button"
          variant="primary"
        >
          Retry Upload
        </ButtonBase>
      </div>
    </div>
  )
}

export { UploadError }
