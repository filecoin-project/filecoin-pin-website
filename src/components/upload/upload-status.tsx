import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { useUploadProgress } from '../../hooks/use-upload-progress.ts'
import type { Progress } from '../../types/upload-progress.ts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion.tsx'
import { FileInfo } from '../ui/file-info.tsx'
import { UploadCompleted } from './upload-completed.tsx'
import { UploadProgress } from './upload-progress.tsx'

export interface UploadStatusProps {
  fileName: DatasetPiece['fileName']
  fileSize: DatasetPiece['fileSize']
  progresses: Array<Progress>
  isExpanded?: boolean
  onToggleExpanded?: () => void
  cid?: DatasetPiece['cid']
  pieceCid?: DatasetPiece['pieceCid']
  transactionHash: DatasetPiece['transactionHash']
  network?: DatasetPiece['network']
  datasetId?: DatasetPiece['datasetId']
}

function UploadStatus({
  fileName,
  fileSize,
  progresses,
  isExpanded = true,
  onToggleExpanded,
  cid,
  datasetId,
  pieceCid,
  transactionHash,
}: UploadStatusProps) {
  // Use the upload progress hook to calculate all progress-related values
  const { isCompleted, badgeStatus } = useUploadProgress(progresses, cid)

  return (
    <Accordion
      className="rounded-xl space-y-6 overflow-hidden border p-6 border-zinc-700"
      collapsible
      onValueChange={onToggleExpanded ? () => onToggleExpanded() : undefined}
      type="single"
      value={isExpanded ? 'file-card' : ''}
    >
      <AccordionItem value="file-card">
        <FileInfo badgeStatus={badgeStatus} fileName={fileName} fileSize={fileSize}>
          <AccordionTrigger />
        </FileInfo>

        <AccordionContent className="space-y-6 mt-6">
          {isCompleted && cid ? (
            <UploadCompleted cid={cid} datasetId={datasetId} fileName={fileName} pieceCid={pieceCid} />
          ) : (
            <UploadProgress cid={cid} fileName={fileName} progresses={progresses} transactionHash={transactionHash} />
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export { UploadStatus }
