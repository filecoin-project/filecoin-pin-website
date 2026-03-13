import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { useUploadProgress } from '../../hooks/use-upload-progress.ts'
import type { StepState } from '../../types/upload/step.ts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion.tsx'
import { FileInfo } from '../ui/file-info.tsx'
import { UploadCompleted } from './upload-completed.tsx'
import { UploadProgress } from './upload-progress.tsx'

export interface UploadStatusProps {
  fileName: DatasetPiece['fileName']
  fileSize: DatasetPiece['fileSize']
  stepStates: Array<StepState>
  isExpanded?: boolean
  onToggleExpanded?: () => void
  cid?: DatasetPiece['cid']
  pieceCid?: DatasetPiece['pieceCid']
  transactionHash: DatasetPiece['transactionHash']
  network?: DatasetPiece['network']
  datasetId?: DatasetPiece['datasetId']
  copyCount?: number
  datasetIds?: DatasetPiece['datasetIds']
  transactionHashes?: string[]
  confirmedCopies?: number
  expectedCopies?: number
}

function UploadStatus({
  fileName,
  fileSize,
  stepStates,
  isExpanded = true,
  onToggleExpanded,
  cid,
  datasetId,
  pieceCid,
  transactionHash,
  copyCount,
  datasetIds,
  transactionHashes,
  confirmedCopies,
  expectedCopies,
}: UploadStatusProps) {
  // Use the upload progress hook to calculate all progress-related values
  const { uploadOutcome, uploadBadgeStatus } = useUploadProgress({ stepStates, cid })

  const { isUploadSuccessful } = uploadOutcome

  return (
    <Accordion
      className="rounded-xl space-y-6 overflow-hidden border p-6 border-zinc-700"
      collapsible
      onValueChange={onToggleExpanded ? () => onToggleExpanded() : undefined}
      type="single"
      value={isExpanded ? 'file-card' : ''}
    >
      <AccordionItem value="file-card">
        <FileInfo badgeStatus={uploadBadgeStatus} fileName={fileName} fileSize={fileSize}>
          <AccordionTrigger />
        </FileInfo>

        <AccordionContent className="space-y-6 mt-6">
          {isUploadSuccessful && cid ? (
            <UploadCompleted
              cid={cid}
              copyCount={copyCount}
              datasetId={datasetId}
              datasetIds={datasetIds}
              fileName={fileName}
              pieceCid={pieceCid}
            />
          ) : (
            <UploadProgress
              cid={cid}
              confirmedCopies={confirmedCopies}
              expectedCopies={expectedCopies}
              fileName={fileName}
              stepStates={stepStates}
              transactionHash={transactionHash}
              transactionHashes={transactionHashes}
            />
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export { UploadStatus }
