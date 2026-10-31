import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { isCopyRemovalScheduled, isDeletionScheduled } from '../../utils/file-deletion.ts'
import { getIpfsGatewayPreviewLink } from '../../utils/links.ts'
import { displayFileName } from './drive-api.ts'

// Inline rendering also depends on the browser and media codecs.
export const canPreviewFile = (file: DatasetPiece) =>
  Boolean(file.cid) &&
  !file.importedCar &&
  !file.isDirectory &&
  /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp|pdf|txt|md|markdown|json|html?|mp3|wav|ogg|mp4|webm)$/i.test(
    displayFileName(file)
  )

export function fileShareLink(file: DatasetPiece): string | undefined {
  if (isDeletionScheduled(file) || (file.upload && file.upload.phase !== 'complete')) return undefined
  if (!file.importedCar) {
    if (!file.cid) return undefined
    if (file.isDirectory) return getIpfsGatewayPreviewLink(file.cid, '')
    return getIpfsGatewayPreviewLink(file.cid, displayFileName(file))
  }
  if (!file.pieceCid) return undefined
  const datasetIds = file.datasetIds ?? [file.datasetId]
  for (const [index, serviceURL] of (file.serviceURLs ?? [file.serviceURL]).entries()) {
    if (isCopyRemovalScheduled(file, datasetIds[index])) continue
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
