import type { Synapse } from '@filoz/synapse-sdk'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ providers: vi.fn(), ping: vi.fn() }))
vi.mock('@filoz/synapse-core/sp-registry', () => ({ getApprovedPDPProviders: mocks.providers }))
vi.mock('@filoz/synapse-core/endorsements', () => ({ getEndorsedProviderIds: async () => [4n] }))
vi.mock('@filoz/synapse-core/sp', () => ({ ping: mocks.ping }))
vi.mock('@filoz/synapse-sdk/warm-storage', () => ({ WarmStorageService: class {} }))
vi.mock('@filoz/synapse-sdk/storage', () => ({
  StorageContext: class {
    provider: { id: bigint }
    constructor({ provider }: { provider: { id: bigint } }) {
      this.provider = provider
    }
  },
}))

import { createFreshUploadContexts } from './fresh-contexts.ts'

beforeEach(() => {
  mocks.ping.mockReset().mockResolvedValue(undefined)
})

it('selects a different provider when filling a missing copy', async () => {
  mocks.providers.mockResolvedValue([
    { id: 4n, pdp: { serviceURL: 'https://existing.example' } },
    { id: 2n, pdp: { serviceURL: 'https://additional.example' } },
  ])
  const existingProviderIds = [4n]
  const contexts = await createFreshUploadContexts({ client: {} } as Synapse, 'browser', 1, existingProviderIds)
  expect(contexts.map((context) => context.provider.id)).toEqual([2n])
  expect(existingProviderIds).toEqual([4n])
  expect(mocks.ping).toHaveBeenCalledWith('https://additional.example')
})

it('does not reuse the existing provider when no additional provider is available', async () => {
  mocks.providers.mockResolvedValue([{ id: 4n, pdp: { serviceURL: 'https://existing.example' } }])
  expect(await createFreshUploadContexts({ client: {} } as Synapse, 'browser', 1, [4n])).toEqual([])
  expect(mocks.ping).not.toHaveBeenCalled()
})
