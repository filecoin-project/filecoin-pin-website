import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { isCopyRemovalScheduled, isDeletionScheduled } from '../../utils/file-deletion.ts'
import { getIpfsGatewayPreviewLink } from '../../utils/links.ts'
import { displayFileName } from './drive-api.ts'

// Gateway previews need a stored piece and a root CID not known-unindexed on
// IPNI. Encrypted pieces never preview through a gateway: the public CID
// serves ciphertext — they open the external viewer instead (canPreviewEncryptedFile).
export const canPreviewFile = (file: DatasetPiece) =>
  Boolean(file.cid && file.pieceCid) &&
  file.ipfsIndexed !== false &&
  !file.encrypted &&
  !file.importedCar &&
  !file.isDirectory

/** Encrypted previews open the external viewer; format support is decided there. */
export const canPreviewEncryptedFile = (file: DatasetPiece) =>
  Boolean(file.encrypted && file.cid && file.pieceCid) && file.ipfsIndexed !== false && !file.importedCar

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
