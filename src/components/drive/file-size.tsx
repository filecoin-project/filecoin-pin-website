import { CircleHelp } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

export function FileSize({ file }: { file: Pick<DatasetPiece, 'fileSize' | 'encrypted' | 'fileSizeIsStored'> }) {
  const tooltipId = useId()
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const stored = file.encrypted && file.fileSizeIsStored && !['Unknown', '—'].includes(file.fileSize)
  useEffect(() => {
    if (!position) return
    const close = () => setPosition(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [position])
  const show = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(rect.right - 224, window.innerWidth - 232)),
      top: rect.bottom + 110 < window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - 100),
    })
  }
  return (
    <span className="inline-flex items-center gap-1">
      {file.fileSize}
      {stored && (
        <button
          aria-describedby={position ? tooltipId : undefined}
          aria-label="About encrypted file size"
          className="text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onBlur={() => setPosition(null)}
          onClick={(event) => show(event.currentTarget)}
          onFocus={(event) => show(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPosition(null)
          }}
          onMouseEnter={(event) => show(event.currentTarget)}
          onMouseLeave={(event) => {
            if (document.activeElement !== event.currentTarget) setPosition(null)
          }}
          type="button"
        >
          <CircleHelp aria-hidden="true" size={13} />
        </button>
      )}
      {stored &&
        position &&
        createPortal(
          <span
            className="pointer-events-none fixed z-100 w-56 rounded-md border border-border bg-surface-raised p-2 text-left text-xs font-normal text-foreground shadow-lg"
            id={tooltipId}
            role="tooltip"
            style={position}
          >
            Recovered from storage. This is the encrypted size, including encryption overhead, rather than the original
            file size.
          </span>,
          document.body
        )}
    </span>
  )
}
