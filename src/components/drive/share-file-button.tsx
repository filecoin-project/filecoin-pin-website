import * as Dialog from '@radix-ui/react-dialog'
import { Share2, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { displayFileName } from '../../lib/filecoin-pin/drive-api.ts'
import { fileShareLink } from '../../lib/filecoin-pin/file-links.ts'
import { cn } from '../../utils/cn.ts'
import { buttonVariants } from '../ui/button/button-base.tsx'
import { CopyButton } from '../ui/copy-button.tsx'

export function ShareFileButton({
  file,
  disabled = false,
  variant = 'inline',
}: {
  file: DatasetPiece
  disabled?: boolean
  variant?: 'inline' | 'button'
}) {
  const [open, setOpen] = useState(false)
  const link = fileShareLink(file)
  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger asChild>
        <button
          className={
            variant === 'button'
              ? cn(
                  buttonVariants({ variant: 'secondary', size: 'sm', disabled: disabled || !link }),
                  'min-h-9 w-full min-w-0 gap-1.5 px-3 py-1.5 text-xs'
                )
              : 'inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent disabled:opacity-40'
          }
          disabled={disabled || !link}
          title={link ? 'Show the share link and QR code' : 'A share link is unavailable for this record.'}
          type="button"
        >
          <Share2 aria-hidden="true" size={14} />
          Share
        </button>
      </Dialog.Trigger>
      {link && (
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-6 text-foreground shadow-xl focus:outline-none">
            <Dialog.Title className="pr-8 text-lg font-semibold">
              Share {file.isDirectory ? 'folder' : 'file'}
            </Dialog.Title>
            <Dialog.Description className="mt-2 break-words text-sm text-muted">
              {displayFileName(file)}
            </Dialog.Description>
            <Dialog.Close
              aria-label="Close share"
              className="absolute right-4 top-4 rounded-lg p-2 text-muted hover:bg-surface-raised hover:text-foreground focus:brand-outline"
            >
              <X aria-hidden="true" size={20} />
            </Dialog.Close>
            <div className="mx-auto my-5 w-fit rounded-xl border border-border bg-white p-2">
              <QRCodeSVG level="M" marginSize={4} size={224} title="Share link QR code" value={link} />
            </div>
            <p className="mb-3 text-center text-sm text-muted">
              {file.isDirectory
                ? 'Scan to browse this folder.'
                : file.importedCar
                  ? 'Scan to download the original CAR archive from its storage provider.'
                  : 'Scan to open this file. Your browser may display or download it.'}
            </p>
            <label className="text-xs text-muted" htmlFor={`share-link-${file.id}`}>
              Share link
            </label>
            <input
              className="drive-field mt-1 w-full px-3 py-2 text-xs"
              id={`share-link-${file.id}`}
              onFocus={(event) => event.target.select()}
              readOnly
              value={link}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">Copy the link, or scan the QR code.</span>
              <CopyButton label="Copy link" value={link} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  )
}
