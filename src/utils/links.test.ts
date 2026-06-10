import { describe, expect, it } from 'vitest'

import { getIpfsGatewayDownloadLink, getIpfsGatewayRenderLink } from './links.ts'

describe('IPFS gateway links', () => {
  it('links directly to the root CID without treating the file name as a path', () => {
    expect(getIpfsGatewayRenderLink('bafyroot')).toBe('https://dweb.link/ipfs/bafyroot')
  })

  it('keeps the original file name in the download query only', () => {
    const href = getIpfsGatewayDownloadLink('bafyroot', 'Screenshot 2026-05-18 at 7.48.15 pm.png')

    expect(href).toBe('https://dweb.link/ipfs/bafyroot?filename=Screenshot%202026-05-18%20at%207.48.15%20pm.png')
    expect(href).not.toContain('/Screenshot')
  })
})
