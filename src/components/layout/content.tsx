import { useState } from 'react'
import { Alert } from '@/components/ui/alert.tsx'
import type { Progress } from '@/types/upload-progress.ts'
import { useUploadHistory } from '../../context/upload-history-context.tsx'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { useUploadExpansion } from '../../hooks/use-upload-expansion.ts'
import { useUploadOrchestration } from '../../hooks/use-upload-orchestration.ts'
import { useUploadUI } from '../../hooks/use-upload-ui.ts'
import { formatFileSize } from '../../utils/format-file-size.ts'
import { Heading } from '../ui/heading.tsx'
import { LoadingState } from '../ui/loading-state.tsx'
import { PageTitle } from '../ui/page-title.tsx'
import DragNDrop from '../upload/drag-n-drop.tsx'
import { UploadStatus } from '../upload/upload-status.tsx'

// Completed state for displaying upload history
const COMPLETED_PROGRESS: Progress[] = [
  { step: 'creating-car', status: 'completed', progress: 100 },
  { step: 'checking-readiness', status: 'completed', progress: 100 },
  { step: 'uploading-car', status: 'completed', progress: 100 },
  { step: 'announcing-cids', status: 'completed', progress: 100 },
  { step: 'finalizing-transaction', status: 'completed', progress: 100 },
]

export default function Content() {
  // Upload orchestration (handles all lifecycle coordination)
  const orchestration = useUploadOrchestration()
  const { startUpload, uploadedFile, activeUpload, dragDropKey } = orchestration

  // UI state derivation
  const { showUploadForm, showActiveUpload, isUploading } = useUploadUI(orchestration)

  // Upload history data access
  const { history: uploadHistory, isLoading: isLoadingPieces } = useUploadHistory()

  // Expansion state management
  const { isExpanded, toggleExpansion } = useUploadExpansion(orchestration)

  // Active upload accordion expansion (separate from history expansion)
  const [activeUploadExpanded, setActiveUploadExpanded] = useState(true)

  // Wallet/synapse status for loading states
  const { wallet, synapse } = useFilecoinPinContext()

  // Determine if we're still initializing (wallet, synapse, provider)
  // Note: We don't block on isLoadingPieces - users can upload while history loads
  const isInitializing = wallet.status === 'loading' || wallet.status === 'idle'

  // Get loading message based on current state
  const getLoadingMessage = () => {
    if (wallet.status === 'loading' || wallet.status === 'idle') {
      return 'Connecting to Filecoin network...'
    }
    if (!synapse) {
      return 'Initializing storage service...'
    }
    return 'Preparing upload interface...'
  }

  // If wallet failed to load, show error instead of spinner
  if (wallet.status === 'error') {
    return (
      <div className="space-y-10">
        <PageTitle />
        <Alert message={`Failed to connect to Filecoin network: ${wallet.error}`} variant="error" />
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <PageTitle />
      <Alert
        message="This demo runs on Filecoin Calibration testnet, where data isn't permanent and infrastructure resets regularly."
        variant="neutral"
      />

      {/* Show drag-n-drop only when not uploading */}
      {showUploadForm && (
        <div className="space-y-6">
          <Heading tag="h2">Upload a file</Heading>
          <DragNDrop isUploading={isUploading} key={dragDropKey} onUpload={startUpload} />
        </div>
      )}

      {/* Show active upload progress */}
      {showActiveUpload && uploadedFile && (
        <div className="space-y-6">
          <Heading tag="h2">Current upload</Heading>
          <UploadStatus
            cid={activeUpload.currentCid}
            fileName={uploadedFile.file.name}
            fileSize={formatFileSize(uploadedFile.file.size)}
            isExpanded={activeUploadExpanded}
            onToggleExpanded={() => setActiveUploadExpanded(!activeUploadExpanded)}
            pieceCid={activeUpload.pieceCid ?? ''}
            progresses={activeUpload.progress}
            transactionHash={activeUpload.transactionHash ?? ''}
          />
        </div>
      )}

      {/* Show loading state while initializing */}
      {(isLoadingPieces || isInitializing) && uploadHistory.length === 0 && (
        <LoadingState message={getLoadingMessage()} />
      )}

      {/* Always show upload history when available */}
      {uploadHistory.length > 0 && (
        <div className="space-y-6">
          <Heading tag="h2">Uploaded files</Heading>
          {uploadHistory.map((upload) => (
            <UploadStatus
              cid={upload.cid}
              datasetId={upload.datasetId}
              fileName={upload.fileName}
              fileSize={upload.fileSize}
              isExpanded={isExpanded(upload.id)}
              key={upload.id}
              onToggleExpanded={() => toggleExpansion(upload.id)}
              pieceCid={upload.pieceCid}
              progresses={COMPLETED_PROGRESS}
              transactionHash={upload.transactionHash}
            />
          ))}
        </div>
      )}
    </div>
  )
}
