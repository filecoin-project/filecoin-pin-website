import { calibration, mainnet } from '@filoz/synapse-core/chains'
import { epochToDate } from '@filoz/synapse-core/utils'
import type { Synapse } from '@filoz/synapse-sdk'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const { scheduled } = vi.hoisted(() => ({ scheduled: vi.fn() }))
vi.mock('@filoz/synapse-core/pdp-verifier', () => ({ getScheduledRemovals: scheduled }))

import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { isDeletionScheduled } from '../../utils/file-deletion.ts'
import { displayFileName, loadDriveFiles, mergeIndexedFiles } from './drive-api.ts'

const root = 'bafkreigh2akiscaildcgck5x5wqlooqkztdxqv5t5uwmybnv5brkw4zj3m'
const pieceCid = 'bafkzcibcd4bdomn3tgwgrh3g532zopskstnbrd2n3sxfqbze7rxt7vqn7veigmy'
const record = (datasetId = '1', pieceId = 0): DatasetPiece => ({
  id: `indexed-${datasetId}-${pieceId}`,
  fileName: '研究.txt',
  folderPath: 'documents/2026',
  fileSize: 'Unknown',
  cid: root,
  pieceCid,
  providerName: 'SP',
  providerId: datasetId,
  datasetId,
  serviceURL: 'https://sp.example',
  transactionHash: '',
  network: 'mainnet',
  uploadedAt: 0,
  pieceId,
})
const dataset = (dataSetId: string, source = 'filecoin-drive') => ({
  dataSetId,
  providerId: dataSetId,
  owner: '0xabc',
  source,
  deleted: false,
})
const piece = (
  dataSetId: string,
  metadata: object | null = { label: '研究.txt', ipfsRootCID: root, path: 'documents/2026' }
) => ({ dataSetId, pieceId: '0', cid: pieceCid, removed: false, metadata })
const synapse = { readClient: {} } as Synapse
const signal = () => new AbortController().signal
beforeEach(() => {
  scheduled.mockReset()
  scheduled.mockResolvedValue([])
})
afterEach(() => vi.unstubAllGlobals())
it('paginates wallet datasets and pieces, filters source/owner, and checks queued removals', async () => {
  const fetcher = vi.fn(async (url: string) => {
    const parsed = new URL(url)
    let body: object
    if (parsed.pathname.endsWith('/data-sets'))
      body = parsed.searchParams.has('cursor')
        ? { data: [dataset('2', 'filecoin-pin'), { ...dataset('3'), owner: '0xdef' }], nextCursor: null }
        : { data: [dataset('1')], nextCursor: 'next' }
    else if (parsed.pathname.endsWith('/pieces'))
      body = parsed.searchParams.has('cursor')
        ? {
            data: [{ ...piece('1', { label: 'archive', ipfsRootCID: root, carPath: '' }), pieceId: '1' }],
            nextCursor: null,
          }
        : { data: [piece('1')], nextCursor: 'next' }
    else body = { data: { name: 'SP', serviceUrl: 'https://sp.example' } }
    return Response.json(body)
  })
  vi.stubGlobal('fetch', fetcher)
  scheduled.mockResolvedValue([0n])
  const files = await loadDriveFiles(synapse, '0xabc', 'mainnet', signal())
  expect(files).toHaveLength(2)
  expect(files[0]).toMatchObject({
    fileName: '研究.txt',
    cid: root,
    folderPath: 'documents/2026',
    removalQueuedCopies: ['1'],
    fileSize: 'Unknown',
    uploadedAt: 0,
  })
  expect(files[1]).toMatchObject({ importedCar: true, folderPath: '' })
  expect(isDeletionScheduled(files[0])).toBe(true)
  expect(scheduled).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls.some(([url]) => url.includes('/data-sets/2/'))).toBe(false)
})
it('recovers unnamed legacy files at the root without storing fallback CIDs as names', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.includes('/providers/')
          ? { data: { name: 'SP', serviceUrl: null } }
          : url.includes('/pieces?')
            ? { data: [piece('1', null)], nextCursor: null }
            : { data: [dataset('1')], nextCursor: null }
      )
    )
  )
  const files = await loadDriveFiles(synapse, '0xabc', 'mainnet', signal())
  expect(files[0]).toMatchObject({ fileName: '', folderPath: '', cid: '' })
  expect(displayFileName(files[0])).toBe(pieceCid)
  expect(displayFileName({ ...files[0], cid: root })).toBe(root)
})
it('fails instead of treating an index or chain read failure as an empty snapshot', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 429 }))
  )
  await expect(loadDriveFiles(synapse, '0xabc', 'mainnet', signal())).rejects.toThrow('429')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.includes('/pieces?') ? { data: [piece('1')], nextCursor: null } : { data: [dataset('1')], nextCursor: null }
      )
    )
  )
  scheduled.mockRejectedValue(new Error('chain unavailable'))
  await expect(loadDriveFiles(synapse, '0xabc', 'mainnet', signal())).rejects.toThrow('chain unavailable')
})
it('keeps recent uploads, local names, paths and deletion checkpoints despite lagging index data', () => {
  const local = {
    ...record(),
    id: 'local',
    fileName: 'local.txt',
    folderPath: 'legacy',
    deletion: { '1': { confirmed: true, transactionHash: 'hash' } },
  }
  const recent = { ...record('9'), id: 'recent' }
  const merged = mergeIndexedFiles([local, recent], [record()])
  expect(merged).toHaveLength(2)
  expect(merged[0]).toMatchObject(local)
  expect(isDeletionScheduled(merged[0])).toBe(true)
  expect(mergeIndexedFiles(merged, [])).toEqual(merged)
})
it('pairs replicas without collapsing repeated uploads, and merges idempotently', () => {
  const remote = [record('1', 0), record('1', 1), record('2', 0), record('2', 1)]
  const merged = mergeIndexedFiles([], remote)
  expect(merged).toHaveLength(2)
  expect(merged.every((file) => file.copyCount === 2)).toBe(true)
  expect(mergeIndexedFiles(merged, remote)).toEqual(merged)
})
it('applies explicit removal to every local alias but not a later identical upload', () => {
  const local = { ...record(), id: 'local-alias-a' }
  const merged = mergeIndexedFiles(
    [local, { ...local, id: 'alias' }, record('1', 1)],
    [{ ...record(), removedCopies: ['1'] }]
  )
  expect(merged.map(isDeletionScheduled)).toEqual([true, true, false])
})

it('retains explicit dataset deletion even when the index still returns its pieces', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.includes('/providers/')
          ? { data: { name: 'SP', serviceUrl: null } }
          : url.includes('/pieces?')
            ? { data: [piece('1')], nextCursor: null }
            : { data: [{ ...dataset('1'), deleted: true }], nextCursor: null }
      )
    )
  )
  const files = await loadDriveFiles(synapse, '0xabc', 'mainnet', signal())
  expect(isDeletionScheduled(files[0])).toBe(true)
  expect(scheduled).not.toHaveBeenCalled()
})

it('absorbs an indexed record if the local upload checkpoint arrives after discovery', async () => {
  const { setCachedPieces, addCachedPiece, getCachedPieces } = await import('../local-storage/piece-cache.ts')
  const scope = '314:discovery-before-checkpoint'
  setCachedPieces(scope, [record()])
  const local = { ...record(), id: 'upload-uuid', fileSize: '10 B', uploadedAt: 123, importedCar: true }
  await addCachedPiece(scope, local)
  expect(getCachedPieces(scope)).toHaveLength(1)
  expect(getCachedPieces(scope)?.[0]).toMatchObject(local)
})

it('adds the indexed secondary to a local partial upload without creating another file', () => {
  const local = { ...record('1'), id: 'local-upload' }
  const previouslyRecovered = record('2')
  const merged = mergeIndexedFiles([local, previouslyRecovered], [record('2'), record('1')])
  expect(merged).toHaveLength(1)
  expect(merged[0]).toMatchObject({ id: 'local-upload', copyCount: 2, datasetIds: ['1', '2'] })
})

it.each(['mainnet', 'calibration'] as const)(
  'recovers %s confirmation time without a block RPC and fills previously unknown fields',
  async (network) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        Response.json(
          url.includes('/providers/')
            ? { data: { name: 'SP', serviceUrl: null } }
            : url.includes('/pieces?')
              ? {
                  data: [
                    {
                      ...piece('1', { label: 'archive.car', ipfsRootCID: root, carPath: '' }),
                      rawSize: '2048',
                      addedAtBlock: '4197629',
                    },
                  ],
                  nextCursor: null,
                }
              : { data: [dataset('1')], nextCursor: null }
        )
      )
    )
    const files = await loadDriveFiles(synapse, '0xabc', network, signal())
    const expected = epochToDate(4197629, (network === 'mainnet' ? mainnet : calibration).genesisTimestamp).getTime()
    expect(files[0]).toMatchObject({ uploadedAt: expected, fileSize: '2 KB' })
    const merged = mergeIndexedFiles([{ ...record(), fileSize: 'Unknown', uploadedAt: 0 }], files)
    expect(merged[0]).toMatchObject({ uploadedAt: expected, fileSize: '2 KB' })
    const cached = { ...record(), fileSize: '123 Bytes', uploadedAt: 123 }
    expect(mergeIndexedFiles([cached], files)[0]).toMatchObject({ uploadedAt: 123, fileSize: '123 Bytes' })
  }
)

it('does not resurrect archived files by combining them with a later upload to new datasets', () => {
  const archived = {
    ...record('1'),
    id: 'archived-local',
    deletion: { '1': { confirmed: true, transactionHash: 'hash' } },
  }
  const result = mergeIndexedFiles([archived], [record('1'), record('2'), record('3')])
  expect(result).toHaveLength(2)
  expect(result[0].datasetIds).toEqual(['1'])
  expect(isDeletionScheduled(result[0])).toBe(true)
  expect(result[1].datasetIds).toEqual(['2', '3'])
  expect(isDeletionScheduled(result[1])).toBe(false)
})

it('reconciles a unique parked task with an indexed upload without losing its name or creating a duplicate', () => {
  const indexed = { ...record('1', 8), uploadedAt: 2000 }
  const local = {
    ...record('', 0),
    id: 'task',
    datasetIds: [],
    copyCount: 0,
    uploadedAt: 1000,
    upload: {
      phase: 'pending' as const,
      error: 'old confirmation error',
      expectedCopies: 1,
      steps: [],
      checks: 0,
      nextCheckAt: 0,
      providers: [{ providerId: '1', serviceURL: 'https://sp.example', stored: true }],
    },
  }
  const merged = mergeIndexedFiles([local], [indexed])
  expect(merged).toHaveLength(1)
  expect(merged[0].id).toBe('task')
  expect(merged[0].datasetId).toBe('1')
  expect(merged[0].copyCount).toBe(1)
  expect(merged[0].upload?.phase).toBe('complete')
  expect(merged[0].upload?.error).toBeUndefined()
})

it('does not use an older indexed upload to confirm a new parked task', () => {
  const indexed = { ...record('1', 8), uploadedAt: 500 }
  const local = {
    ...record('', 0),
    id: 'task',
    datasetIds: [],
    uploadedAt: 1000,
    upload: {
      phase: 'pending' as const,
      expectedCopies: 1,
      steps: [],
      checks: 0,
      nextCheckAt: 0,
      providers: [{ providerId: '1', serviceURL: 'https://sp.example', stored: true }],
    },
  }
  const merged = mergeIndexedFiles([local], [indexed])
  expect(merged).toHaveLength(2)
  expect(merged[0].upload?.phase).toBe('pending')
})
