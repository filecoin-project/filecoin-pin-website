import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { isCopyRemovalScheduled, isDeletionScheduled } from '../../utils/file-deletion.ts'
import { getIpfsGatewayPreviewLink } from '../../utils/links.ts'
import { displayFileName } from './drive-api.ts'

// Gateway previews need a stored piece and a root CID not known-unindexed on
// IPNI. Encrypted pieces never preview through a gateway: the public CID
// serves ciphertext — they decrypt in-browser instead (canDecryptPreview).
export const canPreviewFile = (file: DatasetPiece) =>
  Boolean(file.cid && file.pieceCid) &&
  file.ipfsIndexed !== false &&
  !file.encrypted &&
  !file.importedCar &&
  !file.isDirectory

// Extensions the preview surfaces accept, with the MIME types a new tab needs
// to render (not download) a decrypted blob. Text-like formats use text/plain
// so browsers display them.
const PREVIEW_MIME_TYPES: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/plain',
  markdown: 'text/plain',
  json: 'application/json',
  html: 'text/html',
  htm: 'text/html',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
}

/** MIME type for a file served through the cross-origin gateway preview (`<cid>.ipfs.inbrowser.link`, a different origin per CID); undefined = not previewable. */
export function previewMimeType(fileName: string): string | undefined {
  return PREVIEW_MIME_TYPES[fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()]
}

// Rendered on Drive's own origin (decrypt happens client-side, no isolated
// per-CID gateway domain to fall back to), so anything that executes script
// when loaded as a document — HTML, SVG — is excluded here even though the
// cross-origin gateway preview above can safely offer it. A same-origin
// script would have ordinary access to the session vault.
const SAME_ORIGIN_UNSAFE_EXTENSIONS = new Set(['html', 'htm', 'svg'])

/** MIME type for the same-origin, client-side decrypt preview; undefined = not previewable (including anything that would execute script on this origin). */
export function decryptPreviewMimeType(fileName: string): string | undefined {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
  return SAME_ORIGIN_UNSAFE_EXTENSIONS.has(extension) ? undefined : PREVIEW_MIME_TYPES[extension]
}

/**
 * Encrypted files never preview through a gateway (ciphertext), but the
 * browser holds the key: previewable formats decrypt client-side and open as
 * an object URL. Imported CARs and whole folders stay download-only.
 */
export const canDecryptPreview = (file: DatasetPiece) =>
  Boolean(file.encrypted) &&
  Boolean(file.cid) &&
  !file.importedCar &&
  !file.isDirectory &&
  decryptPreviewMimeType(displayFileName(file)) !== undefined

// Share mirrors download availability: a link exists once a provider holds the
// piece, regardless of remaining replication or indexing work.
export function fileShareLink(file: DatasetPiece): string | undefined {
  if (isDeletionScheduled(file) || !file.pieceCid) return undefined
  // Every public URL to an encrypted piece serves the envelope, not the file.
  // Encrypted sharing mints a keysmith share link instead (ShareFileButton).
  if (file.encrypted) return undefined
  if (!file.importedCar) {
    // Gateway links need an IPNI-indexed root; CAR shares below are provider-direct.
    if (!file.cid || file.ipfsIndexed === false) return undefined
    if (file.isDirectory) return getIpfsGatewayPreviewLink(file.cid, '')
    return getIpfsGatewayPreviewLink(file.cid, displayFileName(file))
  }
  const datasetIds = file.datasetIds ?? [file.datasetId]
  const candidates: { serviceURL: string; dataSetId: string | undefined }[] = (
    file.serviceURLs ?? [file.serviceURL]
  ).map((serviceURL, index) => ({
    serviceURL,
    dataSetId: datasetIds[index],
  }))
  // Bytes can be downloaded before the first copy is confirmed onchain.
  for (const provider of file.upload?.providers ?? []) {
    if (provider.stored) candidates.push({ serviceURL: provider.serviceURL, dataSetId: provider.dataSetId })
  }
  for (const { serviceURL, dataSetId } of candidates) {
    if (dataSetId && isCopyRemovalScheduled(file, dataSetId)) continue
    try {
      const url = new URL(serviceURL)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
      // Address the stored piece, not an IPFS root, to preserve every original CAR byte.
      return new URL(`/piece/${encodeURIComponent(file.pieceCid)}`, url).href
    } catch {
      // Legacy records may have an empty or invalid provider URL; try the next copy.
    }
  }
  return undefined
}
