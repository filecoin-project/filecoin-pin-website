import { Globe } from 'lucide-react'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { cn } from '../../utils/cn.ts'

/**
 * Encrypted at rest is Drive's default and carries no marker. Anything stored
 * unencrypted is the exception and gets flagged PUBLIC, styled like the file
 * status pills so the two stack consistently.
 */
function BadgePublic({ file, className }: { file: Pick<DatasetPiece, 'encrypted'>; className?: string }) {
  if (file.encrypted) return null
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

export { BadgePublic }
