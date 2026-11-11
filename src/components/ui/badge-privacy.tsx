import { Globe, Lock } from 'lucide-react'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { cn } from '../../utils/cn.ts'
import { hasStoredCopy } from '../../utils/upload/blocks-file-deletion.ts'

const ENCRYPTED_TITLE = 'Encrypted at rest. Only your wallet and people you share with can read this file.'

/**
 * Per-file privacy marker. Encrypted is Drive's default, so file rows get
 * quiet reassurance: a bare muted lock, no color, no text. The details panel
 * passes `detailed` and spells it out instead - words beat tooltips on an
 * inspection surface. Anything stored unencrypted is the exception and gets
 * flagged loudly with the Public pill in both variants, styled like the file
 * status pills so the two stack consistently.
 */
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
