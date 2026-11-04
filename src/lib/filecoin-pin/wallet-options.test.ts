import { expect, it, vi } from 'vitest'
import { installedWalletOptions } from './wallet-options.ts'

const connector = (id: string, provider: unknown) => ({
  id,
  uid: id,
  name: id,
  type: 'injected',
  icon: 'data:image/png;base64,a',
  getProvider: vi.fn(async () => provider),
})
it('shows named wallets and omits the legacy entry without inspecting providers', () => {
  const generic = connector('injected', {})
  const named = connector('io.metamask', {})
  expect(installedWalletOptions([generic, named])).toMatchObject([
    { id: 'io.metamask', icon: 'data:image/png;base64,a' },
  ])
  expect(installedWalletOptions([generic])).toEqual([])
  expect(generic.getProvider).not.toHaveBeenCalled()
  expect(named.getProvider).not.toHaveBeenCalled()
})
