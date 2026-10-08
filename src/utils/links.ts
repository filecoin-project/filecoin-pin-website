import { CID } from 'multiformats/cid'

const UPLOAD_COMPLETED_LINKS = {
  ipfsGatewayBaseUrl: 'https://dweb.link/ipfs/',
}

const pdpExplorerBase = (network: string) =>
  `https://pdp.filecoin.cloud/${network === 'mainnet' ? 'mainnet' : 'calibration'}/`

/**
 * download button href
 */
export const getIpfsGatewayDownloadLink = (cid: string, fileName: string): string => {
  return `${getIpfsGatewayRenderLink(cid)}?filename=${encodeURIComponent(fileName)}&download=true`
}

/** Omit download=false: service-worker gateways interpret it as an IPLD inspector request. */
export const getIpfsGatewayPreviewLink = (cid: string, fileName: string): string => {
  const gatewayCid = CID.parse(cid).toV1().toString()
  return `https://${gatewayCid}.ipfs.inbrowser.link/?filename=${encodeURIComponent(fileName)}`
}

/**
 * cid text hyperlink
 */
export const getIpfsGatewayRenderLink = (cid: string): string => {
  return `${UPLOAD_COMPLETED_LINKS.ipfsGatewayBaseUrl}${cid}`
}

/**
 * completed upload provider name text hyperlink
 */
export const getProviderExplorerLink = (providerAddress: string, network = 'calibration'): string => {
  return `${pdpExplorerBase(network)}providers/${providerAddress}`
}

// for pieceCid text hyperlink
export const getPieceExplorerLink = (pieceCid: string, network = 'calibration'): string => {
  return `${pdpExplorerBase(network)}piece/${pieceCid}`
}

// view proofs button
export const getDatasetExplorerLink = (datasetId: string, network = 'calibration'): string => {
  return `${pdpExplorerBase(network)}dataset/${datasetId}`
}

/**
 * TODO: full implementation awaiting download-car, parse to file, client-side logic.
 * @see https://github.com/filecoin-project/filecoin-pin-website/issues/24
 */
export const getSpCarDownloadLink = (ipfsRootCid: string, serviceUrl: string, fileName: string): string => {
  return `${serviceUrl}/ipfs/${ipfsRootCid}?filename=${fileName}.car`
}

/** Block explorer link for a Filecoin transaction hash, network-aware. */
export const getTxExplorerLink = (txHash: string, network?: string): string => {
  const base = network === 'mainnet' ? 'https://filecoin.blockscout.com' : 'https://filecoin-testnet.blockscout.com'
  return `${base}/tx/${txHash}`
}
