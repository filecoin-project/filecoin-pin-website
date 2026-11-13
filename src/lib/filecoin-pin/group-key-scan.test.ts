// @vitest-environment node
import type { Synapse } from '@filoz/synapse-sdk'
import { listDataSets } from 'filecoin-pin/core/data-set'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultGroupKeyId } from './encryption.ts'
import { scanGroupKey } from './group-key-scan.ts'

vi.mock('filecoin-pin/core/data-set', () => ({ listDataSets: vi.fn() }))

const OWNER = '0x44f08D1beFe61255b3C3A349C392C560FA333759' as const
// Pinned in encryption.test.ts against the filecoin-pin reference vector.
const DEFAULT_ID = defaultGroupKeyId(OWNER)
const synapse = { client: { account: { address: OWNER } } } as unknown as Synapse
const listed = vi.mocked(listDataSets)

const idA = `0x${'a'.repeat(32)}`
const idB = `0x${'b'.repeat(32)}`

const dataSet = (dataSetId: bigint, groupKeyId: string, commitment: string, version = '1') =>
  ({
    dataSetId,
    isLive: true,
    metadata: { 'foc/ks': groupKeyId, 'foc/kc': commitment, 'foc/enc': version },
  }) as never

beforeEach(() => {
  listed.mockReset()
  listed.mockResolvedValue([])
})

describe('scanGroupKey', () => {
  it('scans only live data sets that record a group key id', async () => {
    await scanGroupKey(synapse)
    expect(listed).toHaveBeenCalledWith(synapse, { filter: expect.any(Function) })
    const filter = listed.mock.calls[0]?.[1]?.filter
    if (!filter) throw new Error('scanGroupKey passed no filter')
    expect(filter({ isLive: true, metadata: { 'foc/ks': idA } } as never)).toBe(true)
    expect(filter({ isLive: false, metadata: { 'foc/ks': idA } } as never)).toBe(false)
    expect(filter({ isLive: true, metadata: { source: 'filecoin-drive' } } as never)).toBe(false)
    expect(filter({ isLive: true } as never)).toBe(false)
  })

  it('returns the oldest valid group key across the data sets', async () => {
    listed.mockResolvedValue([dataSet(7n, idB, 'v1.b1'), dataSet(3n, idA, 'v1.a1'), dataSet(9n, idA, 'v1.a1')])
    await expect(scanGroupKey(synapse)).resolves.toEqual({ groupKeyId: idA, commitment: 'v1.a1' })
  })

  it('returns undefined when no data set records a group key', async () => {
    await expect(scanGroupKey(synapse)).resolves.toBeUndefined()
  })

  it('throws rather than growing an invalid default group', async () => {
    // The owner's default group key id is on chain, but its records conflict:
    // issuing a credential for it would grow a group no key can fully read.
    listed.mockResolvedValue([dataSet(1n, DEFAULT_ID, 'v1.first'), dataSet(2n, DEFAULT_ID, 'v1.second')])
    await expect(scanGroupKey(synapse)).rejects.toThrow(new RegExp(DEFAULT_ID))
  })

  it('also refuses a default group with a foreign foc/enc version', async () => {
    listed.mockResolvedValue([dataSet(1n, DEFAULT_ID, 'v1.first', '2')])
    await expect(scanGroupKey(synapse)).rejects.toThrow(new RegExp(DEFAULT_ID))
  })

  it('skips an invalid non-default group without blocking setup', async () => {
    listed.mockResolvedValue([dataSet(1n, idA, 'v1.first'), dataSet(2n, idA, 'v1.second')])
    await expect(scanGroupKey(synapse)).resolves.toBeUndefined()
  })

  it('prefers a valid group key even when the default group is broken', async () => {
    listed.mockResolvedValue([
      dataSet(1n, DEFAULT_ID, 'v1.first'),
      dataSet(2n, DEFAULT_ID, 'v1.second'),
      dataSet(5n, idB, 'v1.b1'),
    ])
    await expect(scanGroupKey(synapse)).resolves.toEqual({ groupKeyId: idB, commitment: 'v1.b1' })
  })
})
