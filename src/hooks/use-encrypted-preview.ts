import { useState } from 'react'
import { useBrowserWallet } from '../context/browser-wallet-provider.tsx'
import { decryptCredentials, previewBlob } from '../lib/filecoin-pin/download.ts'
import { toast } from '../utils/toast.tsx'
import type { DatasetPiece } from './use-dataset-pieces.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'

/**
 * Client-side preview of encrypted files: fetch the envelope, decrypt with
 * the session grant (owner-wallet signature as fallback), and open the
 * plaintext in a new tab as an object URL. The tab is opened synchronously on
 * the click so popup blockers allow it; it navigates once decryption lands.
 */
export function useEncryptedPreview() {
  const { synapse, encryption } = useFilecoinPinContext()
  const { ownerSigner } = useBrowserWallet()
  const [previewingId, setPreviewingId] = useState<string | null>(null)

  const openPreview = (file: DatasetPiece) => {
    if (!synapse || previewingId) return
    const tab = window.open('', '_blank')
    setPreviewingId(file.id)
    const credentials = decryptCredentials(encryption, ownerSigner)
    void previewBlob(synapse, file, credentials)
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        if (tab) tab.location.replace(url)
        else window.open(url, '_blank')
        // Long enough for the tab to load; media elements keep playing from memory.
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      })
      .catch((cause: unknown) => {
        tab?.close()
        toast.error(cause instanceof Error ? cause.message : 'Unable to preview this file.')
      })
      .finally(() => setPreviewingId(null))
  }

  return { openPreview, previewingId }
}
