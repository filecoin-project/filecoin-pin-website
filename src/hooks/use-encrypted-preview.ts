import { useEffect, useRef, useState } from 'react'
import { useBrowserWallet } from '../context/browser-wallet-provider.tsx'
import { decryptCredentials, encryptedPieceShareLink } from '../lib/filecoin-pin/download.ts'
import { describeFileAccessError } from '../utils/file-access-error.ts'
import { toast } from '../utils/toast.tsx'
import type { DatasetPiece } from './use-dataset-pieces.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'

/** Prepare an external viewer link; navigation remains a direct user click. */
export function useEncryptedPreview() {
  const { synapse, encryption, storageScope } = useFilecoinPinContext()
  const { ownerSigner } = useBrowserWallet()
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<{
    id: string
    rootCid: string
    url: string
    scope?: string
  } | null>(null)
  const active = useRef<AbortController | null>(null)

  useEffect(() => {
    void storageScope
    setPreviewingId(null)
    setPrepared(null)
    return () => {
      active.current?.abort()
      active.current = null
    }
  }, [storageScope])

  const getPreviewLink = (file: DatasetPiece) =>
    prepared?.scope === storageScope &&
    prepared?.id === file.id &&
    prepared?.rootCid === (file.directoryEntry?.rootCid ?? file.cid)
      ? prepared.url
      : undefined

  const preparePreview = (file: DatasetPiece) => {
    if (!synapse || active.current || getPreviewLink(file)) return
    const controller = new AbortController()
    active.current = controller
    setPreviewingId(file.id)
    const credentials = decryptCredentials(encryption, ownerSigner)
    void encryptedPieceShareLink(synapse, file, credentials, controller.signal)
      .then((url) => {
        if (!controller.signal.aborted)
          setPrepared({ id: file.id, rootCid: file.directoryEntry?.rootCid ?? file.cid, url, scope: storageScope })
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          const failure = describeFileAccessError(cause, 'preview')
          if (failure.cancelled) toast.neutral(failure.message)
          else toast.error(failure.message)
        }
      })
      .finally(() => {
        if (active.current === controller) {
          active.current = null
          setPreviewingId(null)
        }
      })
  }

  return { preparePreview, previewingId, getPreviewLink }
}
