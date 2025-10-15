import { AlertTriangle } from 'lucide-react'
import { useUploadOrchestration } from '../../hooks/use-upload-orchestration.ts'

function UploadError() {
  const { activeUpload, uploadedFile, retryUpload, cancelUpload } = useUploadOrchestration()

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
      <div className="flex gap-3 justify-end">
        <button
          className="px-4 py-2 rounded-lg font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-100 cursor-pointer"
          onClick={cancelUpload}
          type="button"
        >
          Cancel
        </button>
        <button
          className="px-4 py-2 rounded-lg font-medium bg-red-700 hover:bg-red-600 text-red-50 cursor-pointer"
          onClick={retryUpload}
          type="button"
        >
          Retry Upload
        </button>
      </div>
    </div>
  )
}

export { UploadError }
