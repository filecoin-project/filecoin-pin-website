import { describe, expect, it } from 'vitest'

import { getIpfsGatewayDownloadLink, getIpfsGatewayPreviewLink, getIpfsGatewayRenderLink } from './links.ts'

describe('IPFS gateway links', () => {
  it('previews a file without requesting the service-worker gateway inspector', () => {
    const cid = 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe'
    const href = getIpfsGatewayPreviewLink(cid, 'small copy.txt')
    expect(href).toBe(`https://${cid}.ipfs.inbrowser.link/?filename=small%20copy.txt`)
    expect(new URL(href).searchParams.has('download')).toBe(false)
  })

  it('links directly to the root CID without treating the file name as a path', () => {
    expect(getIpfsGatewayRenderLink('bafyroot')).toBe('https://dweb.link/ipfs/bafyroot')
  })

  it('keeps the original file name in the download query and forces attachment disposition', () => {
    const href = getIpfsGatewayDownloadLink('bafyroot', 'Screenshot 2026-05-18 at 7.48.15 pm.png')

    expect(href).toBe(
      'https://dweb.link/ipfs/bafyroot?filename=Screenshot%202026-05-18%20at%207.48.15%20pm.png&download=true'
    )
    expect(href).not.toContain('/Screenshot')
  })
})
