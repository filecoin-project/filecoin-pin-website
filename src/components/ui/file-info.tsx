import { BadgeStatus, type Status } from './badge-status.tsx'
import { Heading } from './heading.tsx'

type FileInfoProps = {
  fileName: string
  fileSize: string
  badgeStatus: Status
  children: React.ReactNode
}

function FileInfo({ fileName, fileSize, badgeStatus, children }: FileInfoProps) {
  return (
    <div className="flex justify-between items-center gap-6">
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <Heading tag="h3">
          <span className="break-words min-w-0" title={fileName}>
            {fileName}
          </span>
        </Heading>
        <p className="text-zinc-400">{fileSize}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <BadgeStatus status={badgeStatus} />
        {children}
      </div>
    </div>
  )
}

export { FileInfo }
