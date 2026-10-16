import type { Synapse } from '@filoz/synapse-sdk'
import { calibration } from '@filoz/synapse-sdk'
import { zeroAddress } from 'viem'
import { beforeEach, expect, it, vi } from 'vitest'
import { assertCurrentStorageChain, resolveStorageChain } from './storage-chain.ts'

const { read } = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('viem/actions', () => ({ readContract: read }))
const currentView = '0x1111111111111111111111111111111111111111'
beforeEach(() => {
  read.mockReset()
})

it('uses the service-selected view after an upgrade without changing the SDK chain snapshot', async () => {
  read.mockResolvedValueOnce(currentView).mockResolvedValueOnce(calibration.contracts.fwss.address)
  const chain = await resolveStorageChain(calibration)
  expect(chain.contracts.fwssView.address).toBe(currentView)
  expect(calibration.contracts.fwssView.address).not.toBe(currentView)
  expect(read.mock.calls[1][1].address).toBe(currentView)
  expect(chain.contracts.pdp).toBe(calibration.contracts.pdp)
})

it('blocks initialization when the selected view belongs to a different service', async () => {
  read.mockResolvedValueOnce(currentView).mockResolvedValueOnce(zeroAddress)
  await expect(resolveStorageChain(calibration)).rejects.toThrow('does not match this network')
})

it('blocks initialization when no view is configured', async () => {
  read.mockResolvedValueOnce(zeroAddress)
  await expect(resolveStorageChain(calibration)).rejects.toThrow('unavailable')
})

it('propagates RPC errors instead of falling back to a potentially obsolete snapshot', async () => {
  read.mockRejectedValueOnce(new Error('RPC unavailable'))
  await expect(resolveStorageChain(calibration)).rejects.toThrow('RPC unavailable')
})

it('blocks uploading when the service upgrades after the console is opened', async () => {
  read.mockResolvedValueOnce(currentView)
  const synapse = { chain: calibration, readClient: {} } as unknown as Synapse
  await expect(assertCurrentStorageChain(synapse)).rejects.toThrow('Reload this page')
})

it('allows the current storage configuration to proceed', async () => {
  read.mockResolvedValueOnce(calibration.contracts.fwssView.address)
  const synapse = { chain: calibration, readClient: {} } as unknown as Synapse
  await expect(assertCurrentStorageChain(synapse)).resolves.toBeUndefined()
})
