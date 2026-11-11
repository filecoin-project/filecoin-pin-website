import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { useUploadProgress } from '../../hooks/use-upload-progress.ts'
import type { StepState } from '../../types/upload/step.ts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion.tsx'
import { BadgeStatus } from '../ui/badge-status.tsx'
import { UploadCompleted } from './upload-completed.tsx'
import { UploadProgress } from './upload-progress.tsx'

export interface UploadStatusProps {
  fileName: DatasetPiece['fileName']
  fileSize: DatasetPiece['fileSize']
  importedCar?: boolean
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
  providerIds?: DatasetPiece['providerIds']
  providerNames?: DatasetPiece['providerNames']
  serviceURLs?: DatasetPiece['serviceURLs']
  transactionHashes?: string[]
  confirmedCopies?: number
  expectedCopies?: number
  uploadNetwork?: string
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
  providerIds,
  providerNames,
  serviceURLs,
  transactionHashes,
  confirmedCopies,
  expectedCopies,
  uploadNetwork,
  network,
}: UploadStatusProps) {
  // Use the upload progress hook to calculate all progress-related values
  const { uploadOutcome, uploadBadgeStatus } = useUploadProgress({ stepStates, cid })

  const { isUploadSuccessful, hasIpniAnnounceFailure } = uploadOutcome

  return (
    <Accordion
      className="overflow-hidden rounded-xl border border-border bg-surface"
      collapsible
      onValueChange={onToggleExpanded ? () => onToggleExpanded() : undefined}
      type="single"
      value={isExpanded ? 'file-card' : ''}
    >
      <AccordionItem value="file-card">
        <div className="flex items-start gap-3 border-b border-border bg-canvas/30 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-800/10 text-accent">
            <File aria-hidden="true" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 break-all text-sm font-medium leading-5" title={fileName}>
              {fileName}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-xs text-muted">{fileSize}</span>
              <BadgeStatus status={uploadBadgeStatus} />
            </div>
          </div>
          <AccordionTrigger aria-label="Toggle upload progress" className="p-1 text-muted" />
        </div>

        <AccordionContent className="p-4 sm:p-5">
          {isUploadSuccessful && cid ? (
            <UploadCompleted
              cid={cid}
              copyCount={copyCount}
              datasetId={datasetId}
              datasetIds={datasetIds}
              fileName={fileName}
              hasIpniAnnounceFailure={hasIpniAnnounceFailure}
              pieceCid={pieceCid}
              providerIds={providerIds}
              providerNames={providerNames}
              serviceURLs={serviceURLs}
            />
          ) : (
            <UploadProgress
              cid={cid}
              confirmedCopies={confirmedCopies}
              expectedCopies={expectedCopies}
              network={uploadNetwork ?? network}
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

import { File } from 'lucide-react'
