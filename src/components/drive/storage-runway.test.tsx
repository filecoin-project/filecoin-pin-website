import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ runway: vi.fn(), scope: '314:alice' }))
vi.mock('filecoin-pin/core/payments', () => ({ getStorageRunway: mocks.runway }))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({ useBrowserWallet: () => ({ transactionRevision: 0 }) }))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({ synapse: {}, storageScope: mocks.scope }),
}))

import { StorageRunway } from './storage-runway.tsx'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)
beforeEach(() => {
  mocks.runway.mockReset()
  mocks.scope = '314:alice'
})

it('shows time until top-up using the library summary and explains the locked-reserve boundary', async () => {
  mocks.runway.mockResolvedValue({ state: 'active', runwayDays: 12 })
  render(<StorageRunway />, { wrapper })
  expect(await screen.findByText('12 days')).toBeTruthy()
  expect(screen.getByText(/Excludes locked reserves/)).toBeTruthy()
})

it('distinguishes no recurring spend from exhausted runway and read failures', async () => {
  mocks.runway.mockResolvedValue({ state: 'no-spend', runwayDays: 0 })
  const first = render(<StorageRunway />, { wrapper })
  expect(await screen.findByText('No recurring charges')).toBeTruthy()
  first.unmount()
  mocks.runway.mockRejectedValue(new Error('RPC unavailable'))
  render(<StorageRunway />, { wrapper })
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Unavailable'))
})
