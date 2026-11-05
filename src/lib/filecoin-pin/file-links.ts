import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { isCopyRemovalScheduled, isDeletionScheduled } from '../../utils/file-deletion.ts'
import { getIpfsGatewayPreviewLink } from '../../utils/links.ts'
import { displayFileName } from './drive-api.ts'

// Preview mirrors download availability plus gateway reachability: a provider
// must hold the piece, and the root CID must not be known-unindexed on IPNI —
// the inbrowser.link gateway resolves providers through cid.contact, so an
// unannounced CID yields a link that cannot load. Unknown indexing state
// (legacy chain-discovered records) keeps the link. Imported CARs stay
// excluded: traversing one root cannot reproduce the archive's other roots or
// extra blocks.
export const canPreviewFile = (file: DatasetPiece) =>
  Boolean(file.cid && file.pieceCid) && file.ipfsIndexed !== false && !file.importedCar && !file.isDirectory

// Share mirrors download availability: a link exists once a provider holds the
// piece, regardless of remaining replication or indexing work.
export function fileShareLink(file: DatasetPiece): string | undefined {
  if (isDeletionScheduled(file) || !file.pieceCid) return undefined
  if (!file.importedCar) {
    // Gateway links require the root CID announced to IPNI; CAR shares below go
    // provider-direct and stay available regardless of indexing.
    if (!file.cid || file.ipfsIndexed === false) return undefined
    if (file.isDirectory) return getIpfsGatewayPreviewLink(file.cid, '')
    return getIpfsGatewayPreviewLink(file.cid, displayFileName(file))
  }
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
