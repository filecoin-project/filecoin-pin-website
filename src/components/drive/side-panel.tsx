import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { type ReactNode, useRef } from 'react'

type SidePanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
}

export function SidePanel({ open, onOpenChange, title, description, children }: SidePanelProps) {
  const returnFocus = useRef<HTMLElement | null>(null)
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l border-border bg-surface text-foreground shadow-xl focus:outline-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (!document.querySelector('[role="dialog"][data-state="open"]') && returnFocus.current?.isConnected)
              returnFocus.current.focus()
          }}
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          }}
        >
          <div className="sticky top-0 z-10 border-b border-border bg-surface px-5 py-5 sm:px-6">
            <Dialog.Title className="pr-10 text-xl font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted">{description}</Dialog.Description>
            <Dialog.Close
              aria-label={`Close ${title}`}
              className="absolute right-4 top-4 rounded-lg p-2 text-muted hover:bg-surface-raised hover:text-foreground focus:brand-outline"
            >
              <X aria-hidden="true" size={20} />
            </Dialog.Close>
          </div>
          <div className="space-y-4 p-5 sm:p-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
