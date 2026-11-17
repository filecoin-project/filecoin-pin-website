import { Globe, Lock } from 'lucide-react'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { cn } from '../../utils/cn.ts'
import { hasStoredCopy } from '../../utils/upload/has-stored-copy.ts'

const ENCRYPTED_TITLE = 'Encrypted at rest. Only your wallet and people you share with can read this file.'

/** Compact icons in file rows; explicit privacy labels in file details. */
function BadgePrivacy({
  file,
  detailed = false,
  className,
}: {
  file: Pick<DatasetPiece, 'encrypted' | 'upload' | 'copyCount'>
  detailed?: boolean
  className?: string
}) {
  if (!hasStoredCopy(file))
    return (
      <span className={cn('text-[11px] text-muted', className)} title="No confirmed stored copy yet.">
        N/A
      </span>
    )
  if (file.encrypted)
    return detailed ? (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] text-success',
          className
        )}
        title={ENCRYPTED_TITLE}
      >
        <Lock aria-hidden="true" size={11} />
        Encrypted
      </span>
    ) : (
      <span
        aria-label="Encrypted"
        className={cn('inline-flex items-center text-muted/60', className)}
        role="img"
        title={ENCRYPTED_TITLE}
      >
        <Lock aria-hidden="true" size={12} />
      </span>
    )
  if (!detailed)
    return (
      <span
        aria-label="Public"
        className={cn('inline-flex items-center text-muted', className)}
        role="img"
        title="Stored unencrypted. Anyone with its CID can read this file."
      >
        <Globe aria-hidden="true" size={12} />
      </span>
    )
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-warning',
        className
      )}
      title="Stored unencrypted. Anyone with its CID can read this file."
    >
      <Globe aria-hidden="true" size={11} />
      Public
    </span>
  )
}

export { BadgePrivacy }
