import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sync: vi.fn(), expirations: {} as Record<string, bigint> }))
vi.mock('@filoz/synapse-core/session-key', async (original) => ({
  ...(await original<typeof import('@filoz/synapse-core/session-key')>()),
  fromSecp256k1: () => ({
    client: {},
    expirations: mocks.expirations,
    syncExpirations: mocks.sync,
    hasPermissions: (permissions: string[]) =>
      permissions.every((permission) => mocks.expirations[permission] > BigInt(Math.floor(Date.now() / 1000))),
  }),
}))
vi.mock('@filoz/synapse-sdk', async (original) => ({
  ...(await original<typeof import('@filoz/synapse-sdk')>()),
  Synapse: class {},
}))

import { TerminateServicePermission } from '@filoz/synapse-core/session-key'
import { browserSynapse, SESSION_PERMISSIONS, SESSION_REVOCATION_PERMISSIONS } from './browser-wallet.ts'

const session = { privateKey: `0x${'1'.repeat(64)}` as const, expiresAt: 1 }
const runtime = () => browserSynapse('0x1111111111111111111111111111111111111111', 'mainnet', session)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.sync.mockResolvedValue(undefined)
  for (const permission of SESSION_REVOCATION_PERMISSIONS) mocks.expirations[permission] = 0n
})

it('accepts a three-permission session and derives its expiry without requiring termination', async () => {
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)
  for (const permission of SESSION_PERMISSIONS) mocks.expirations[permission] = expiry
  const client = runtime()
  await client.validate()
  expect(client.expiresAt()).toBe(Number(expiry))
  expect(mocks.sync).toHaveBeenCalledWith(SESSION_PERMISSIONS)
  expect(SESSION_PERMISSIONS).not.toContain(TerminateServicePermission)
})

it('does not discard a legacy key until its termination permission is revoked too', async () => {
  mocks.expirations[TerminateServicePermission] = BigInt(Math.floor(Date.now() / 1000) + 3600)
  const client = runtime()
  expect(await client.isRevoked()).toBe(false)
  expect(mocks.sync).toHaveBeenCalledWith(SESSION_REVOCATION_PERMISSIONS)
  mocks.expirations[TerminateServicePermission] = 0n
  expect(await client.isRevoked()).toBe(true)
})
