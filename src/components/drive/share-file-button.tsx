import * as Dialog from '@radix-ui/react-dialog'
import { checkIpniIndexer } from 'filecoin-pin/core/utils'
import { Loader2, Share2, X } from 'lucide-react'
import { CID } from 'multiformats/cid'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { useFilecoinPinContext } from '../../hooks/use-filecoin-pin-context.ts'
import { readIndexingChecks, reserveIndexingCheck, resetIndexingChecks } from '../../hooks/use-ipfs-indexing.ts'
import { decryptCredentials, encryptedPieceShareLink } from '../../lib/filecoin-pin/download.ts'
import { displayFileName } from '../../lib/filecoin-pin/drive-api.ts'
import { fileShareLink } from '../../lib/filecoin-pin/file-links.ts'
import { cn } from '../../utils/cn.ts'
import { describeFileAccessError } from '../../utils/file-access-error.ts'
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
  const { encryption, synapse, storageScope } = useFilecoinPinContext()
  const { ownerSigner } = useBrowserWallet()
  const [minted, setMinted] = useState<{ key: string; link: string; gateway?: boolean } | null>(null)
  const [mintError, setMintError] = useState<ReturnType<typeof describeFileAccessError> | null>(null)
  // The local ipfsIndexed flag goes stale: the post-upload checker gives up
  // after a few minutes while IPNI often indexes later. The dialog asks the
  // index live, but shares the same reservation budget as the background
  // checker so remounting/reopening the dialog can't fire a second direct
  // cid.contact lookup within the same window — an early lookup negative-
  // caches the CID for the public indexer, working against the very thing
  // we're waiting for.
  const [indexed, setIndexed] = useState<{ key: string; onIpni: boolean | undefined } | null>(null)
  const active = useRef<AbortController | null>(null)
  const shareRootCid = file.encrypted ? (file.directoryEntry?.rootCid ?? file.cid) : file.cid
  const shareKey = JSON.stringify([storageScope, file.id, shareRootCid, file.encrypted])
  useEffect(() => {
    void shareKey
    setOpen(false)
    setMinted(null)
    setMintError(null)
    setIndexed(null)
    return () => {
      active.current?.abort()
      active.current = null
    }
  }, [shareKey])
  const sharesWholeFolder = Boolean(file.encrypted && (file.isDirectory || file.directoryEntry))
  const gatewayLink = fileShareLink(file)
  // Deletion/upload-state gating is shared with plaintext links. An encrypted
  // piece needs no grant (the owner wallet signs once at mint) and no IPNI
  // row (minting reads the piece provider-direct; the dialog checks the
  // index live and warns if the viewer cannot resolve the link yet).
  const shareable = file.encrypted
    ? fileShareLink({ ...file, encrypted: false, ipfsIndexed: undefined }) !== undefined
    : gatewayLink !== undefined
  const link = file.encrypted ? (minted?.key === shareKey ? minted.link : undefined) : gatewayLink

  const onOpenChange = (next: boolean) => {
    active.current?.abort()
    active.current = null
    setOpen(next)
    if (!next || !file.encrypted) return
    const controller = new AbortController()
    active.current = controller
    if (indexed?.key !== shareKey || indexed.onIpni === undefined) {
      if (file.ipfsIndexed) setIndexed({ key: shareKey, onIpni: true })
      else if (storageScope)
        void reserveIndexingCheck(storageScope, shareRootCid, Date.now())
          .then(async (reservation) => {
            if (controller.signal.aborted) return
            if (!reservation) {
              // Respect the shared cooldown rather than issuing another lookup.
              const stored = readIndexingChecks(storageScope)[shareRootCid]
              setIndexed({ key: shareKey, onIpni: stored?.indexed === true })
              return
            }
            const onIpni = await checkIpniIndexer(CID.parse(shareRootCid), {
              maxAttempts: 1,
              ipniIndexerUrl: 'https://cid.contact',
            })
            if (controller.signal.aborted) return
            setIndexed({ key: shareKey, onIpni })
            // Let the background watcher re-confirm and update the file row.
            if (onIpni) await resetIndexingChecks(storageScope, shareRootCid)
          })
          .catch(() => {
            if (!controller.signal.aborted) setIndexed({ key: shareKey, onIpni: undefined })
          })
    }
    if (minted?.key === shareKey) return
    setMintError(null)
    encryptedPieceShareLink(synapse, file, decryptCredentials(encryption, ownerSigner), controller.signal)
      .then((created) => {
        if (!controller.signal.aborted) setMinted({ key: shareKey, link: created })
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        const message = cause instanceof Error ? cause.message : 'Unable to create a share link.'
        // A data set flagged foc/enc marks every piece encrypted, but a piece
        // stored before encryption shipped is plain: degrade to its public link.
        const publicLink = /not an encrypted upload/i.test(message)
          ? fileShareLink({ ...file, encrypted: false, ipfsIndexed: undefined })
          : undefined
        if (publicLink) setMinted({ key: shareKey, link: publicLink, gateway: true })
        else setMintError(describeFileAccessError(cause, 'share'))
      })
  }
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Trigger asChild>
        <button
          className={
            variant === 'button'
              ? cn(
                  buttonVariants({ variant: 'secondary', size: 'sm', disabled: disabled || !shareable }),
                  'h-7 min-h-7 w-auto min-w-0 gap-1.5 rounded-md px-2.5 py-1 text-xs'
                )
              : 'inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent disabled:opacity-40'
          }
          disabled={disabled || !shareable}
          title={
            shareable
              ? file.encrypted && !encryption.ready
                ? 'Show the share link. Your wallet signs once to unlock sharing this session.'
                : 'Show the share link and QR code'
              : 'A share link is unavailable for this record.'
          }
          type="button"
        >
          <Share2 aria-hidden="true" size={14} />
          Share
        </button>
      </Dialog.Trigger>
      {shareable && (
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-6 text-foreground shadow-xl focus:outline-none">
            <Dialog.Title className="pr-8 text-lg font-semibold">
              Share {sharesWholeFolder || file.isDirectory ? 'folder' : 'file'}
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
            {sharesWholeFolder && (
              <div
                className="mt-4 rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning"
                role="note"
              >
                <p className="font-semibold">This link shares the entire uploaded folder.</p>
                <p className="mt-1">
                  Anyone with this link can read every file and subfolder in the original upload, including files
                  outside your selection. Access cannot be revoked.
                </p>
              </div>
            )}
            {link ? (
              <>
                <div className="mx-auto my-5 w-fit rounded-xl border border-border bg-white p-2">
                  <QRCodeSVG level="M" marginSize={4} size={224} title="Share link QR code" value={link} />
                </div>
                <p className="mb-3 text-center text-sm text-muted">
                  {file.encrypted && !(minted?.key === shareKey && minted.gateway)
                    ? sharesWholeFolder
                      ? 'Scan to open the entire uploaded folder.'
                      : 'Anyone with this link can read the entire upload, including any files and subfolders it contains. The key travels in the link and never reaches a server. Share links cannot be revoked.'
                    : file.isDirectory
                      ? 'Scan to browse this folder.'
                      : file.importedCar
                        ? 'Scan to download the original CAR archive from its storage provider.'
                        : 'Scan to open this file. Your browser may display or download it.'}
                </p>
                {file.encrypted && indexed?.key === shareKey && !indexed.onIpni && (
                  <p className="mb-3 rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-xs text-warning">
                    {indexed.onIpni === undefined
                      ? 'Availability couldn’t be checked. You can still copy the link, but the viewer may not retrieve this upload yet. Close and reopen Share to check again.'
                      : 'This file hasn’t appeared on the public IPFS index yet. The link is valid but opens with “not available yet” until indexing finishes — usually within minutes.'}
                  </p>
                )}
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
              </>
            ) : mintError ? (
              <div className="my-6 space-y-3">
                <p
                  className={cn('text-sm', mintError.cancelled ? 'text-muted' : 'text-danger')}
                  role={mintError.cancelled ? 'status' : 'alert'}
                >
                  {mintError.message}
                </p>
                <button className="text-sm text-link underline" onClick={() => onOpenChange(true)} type="button">
                  Try again
                </button>
              </div>
            ) : (
              <p className="my-6 flex items-center gap-2 text-sm text-muted">
                <Loader2 aria-hidden="true" className="animate-spin" size={16} />
                Creating a share link from the stored encrypted file…
              </p>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  )
}
