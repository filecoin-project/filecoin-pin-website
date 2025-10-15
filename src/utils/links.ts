const UPLOAD_COMPLETED_LINKS = {
  ipfsGatewayBaseUrl: 'https://ipfs.io/ipfs/',
  // TODO: use network elsewhere (links.ts)
  pdpExplorerBaseUrl: 'https://pdp.vxb.ai/calibration/',
}

/**
 * download button href
 */
export const getIpfsGatewayDownloadLink = (cid: string, fileName: string): string => {
  return `${getIpfsGatewayRenderLink(cid, fileName)}?download=true&filename=${fileName}`
}

/**
 * cid text hyperlink
 */
export const getIpfsGatewayRenderLink = (cid: string, fileName: string): string => {
  return `${UPLOAD_COMPLETED_LINKS.ipfsGatewayBaseUrl}${cid}/${fileName}`
}

/**
 * completed upload provider name text hyperlink
 */
export const getProviderExplorerLink = (providerAddress: string): string => {
  return `${UPLOAD_COMPLETED_LINKS.pdpExplorerBaseUrl}providers/${providerAddress}`
}

// for pieceCid text hyperlink
export const getPieceExplorerLink = (pieceCid: string): string => {
  return `${UPLOAD_COMPLETED_LINKS.pdpExplorerBaseUrl}piece/${pieceCid}`
}

// view proofs button
export const getDatasetExplorerLink = (datasetId: string): string => {
  return `${UPLOAD_COMPLETED_LINKS.pdpExplorerBaseUrl}dataset/${datasetId}`
}

/**
 * TODO: full implementation awaiting download-car, parse to file, client-side logic.
 * @see https://github.com/filecoin-project/filecoin-pin-website/issues/29#issuecomment-3403015452
 */
export const getSpCarDownloadLink = (ipfsRootCid: string, serviceUrl: string, _fileName?: string): string => {
  // providerInfo.getDownloadLink or from filecoin-pin
  // download and filename query params are broken currently
  // return `https://${providerInfo.serviceUrl}/ipfs/${ipfsRootCid}?download=true&filename=${fileName}`
  return `${serviceUrl}ipfs/${ipfsRootCid}`
}
