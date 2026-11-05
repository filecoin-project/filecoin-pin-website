import { act, renderHook } from '@testing-library/react'
import { checkIpniIndexer } from 'filecoin-pin/core/utils'
import { CID } from 'multiformats/cid'
import { afterEach, expect, it, vi } from 'vitest'
import { fileShareLink } from '../lib/filecoin-pin/file-links.ts'
import type { DatasetPiece } from './use-dataset-pieces.ts'
import { useIpfsIndexing } from './use-ipfs-indexing.ts'

const file = {
  id: 'review',
  fileName: 'review.txt',
  cid: 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe',
  pieceCid: 'bafkzcibcd4bdomn3tgwgrh3g532zopskstnbrd2n3sxfqbze7rxt7vqn7veigmy',
  copyCount: 2,
  datasetId: '1',
  datasetIds: ['1', '2'],
  serviceURL: 'https://a.example.com',
  serviceURLs: ['https://a.example.com', 'https://b.example.com'],
  ipfsIndexed: false,
} as DatasetPiece
const indexedResponse = () =>
  new Response(
    JSON.stringify({
      MultihashResults: [
        { ProviderResults: [{ Provider: { ID: 'available', Addrs: ['/dns/a.example.com/tcp/443/https'] } }] },
      ],
    })
  )
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('enables gateway links through one synced and advertised replica using the real SDK', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn(async (url: string) =>
    url.startsWith('https://cid.contact')
      ? indexedResponse()
      : new Response(JSON.stringify({ synced: url.startsWith('https://a.example.com') }))
  )
  vi.stubGlobal('fetch', fetch)
  // Both the root lookup and provider-first availability check accept the usable replica.
  expect(await checkIpniIndexer(CID.parse(file.cid), { maxAttempts: 1, ipniIndexerUrl: 'https://cid.contact' })).toBe(
    true
  )
  const update = vi.fn()
  const hook = renderHook(() => useIpfsIndexing('review-two-providers', [file], update))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(update).toHaveBeenCalledWith(file.cid, true, 1)
  expect(fileShareLink({ ...file, ipfsIndexed: update.mock.calls[0][1] })).toBeTruthy()
  hook.unmount()
  const control = vi.fn()
  renderHook(() => useIpfsIndexing('review-one-provider', [{ ...file, serviceURLs: [file.serviceURL] }], control))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(control).toHaveBeenCalledWith(file.cid, true, 1)
  expect(fileShareLink({ ...file, ipfsIndexed: true })).toBeTruthy()
})
