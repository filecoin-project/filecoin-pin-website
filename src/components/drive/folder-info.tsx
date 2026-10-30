import { Folder, FolderUp, Info } from 'lucide-react'
import { useId, useState } from 'react'

export function FolderInfo() {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="relative inline-flex shrink-0 align-middle">
      <button
        aria-describedby={open ? id : undefined}
        aria-label="About folder types"
        className="rounded p-1 text-muted hover:text-foreground focus:brand-outline"
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        type="button"
      >
        <Info aria-hidden="true" size={13} />
      </button>
      {open && (
        <span
          className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-64 space-y-3 rounded-lg border border-border bg-surface p-3 text-left text-xs font-normal tracking-normal leading-relaxed text-foreground shadow-lg"
          id={id}
          role="tooltip"
        >
          <span className="flex gap-2">
            <Folder aria-hidden="true" className="mt-0.5 shrink-0 text-accent" size={16} />
            <span>
              <strong className="block font-medium">Organizing folder</strong>
              <span className="text-muted">Groups separate uploads. Add or delete files individually.</span>
            </span>
          </span>
          <span className="flex gap-2">
            <FolderUp aria-hidden="true" className="mt-0.5 shrink-0 text-accent" size={16} />
            <span>
              <strong className="block font-medium">Uploaded folder</strong>
              <span className="text-muted">Uploaded as one unit. Browse its contents; delete the whole folder.</span>
            </span>
          </span>
        </span>
      )}
    </span>
  )
}
