import { describe, expect, it } from 'vitest'
import {
  deleteEmptyFolder,
  directoryFolders,
  normalizeFolder,
  parseDirectoryBackup,
  readFolders,
  saveFolders,
} from './drive-directory.ts'

import { mutateCachedPieces, setCachedPieces } from './piece-cache.ts'

const record = {
  id: 'file-1',
  fileName: '研究.txt',
  fileSize: '5 B',
  cid: 'bafkreigh2akiscaildcgck5x5wqlooqkztdxqv5t5uwmybnv5brkw4zj3m',
  pieceCid: 'bafkzcibcd4bdomn3tgwgrh3g532zopskstnbrd2n3sxfqbze7rxt7vqn7veigmy',
  providerName: 'Provider',
  datasetId: '1',
  providerId: '4',
  serviceURL: '',
  transactionHash: '',
  network: 'mainnet',
  uploadedAt: 1,
  pieceId: 1,
  folderPath: 'reports/2026',
}
const backupFor = (file: object) => JSON.stringify({ version: 1, scope: '314:alice', files: [file], folders: [] })

describe('browser directory boundaries', () => {
  it('keeps folders separate across wallets and networks', async () => {
    await saveFolders('314:alice', ['reports/2026'])
    expect(readFolders('314:alice')).toEqual(['reports', 'reports/2026'])
    expect(readFolders('314:bob')).toEqual([])
    expect(readFolders('314159:alice')).toEqual([])
  })
  it('builds parent folders and rejects traversal paths', () => {
    expect(directoryFolders([], ['a/b/c', 'a/b'])).toEqual(['a', 'a/b', 'a/b/c'])
    expect(directoryFolders([], ['reports-old', 'reports/2026'])).toEqual(['reports', 'reports/2026', 'reports-old'])
    expect(normalizeFolder('/a//b/')).toBe('a/b')
    expect(() => normalizeFolder('a/../b')).toThrow('dot segments')
  })
  it('rejects directory imports for another wallet or network', () => {
    const raw = JSON.stringify({ version: 1, scope: '314:alice', files: [], folders: [] })
    expect(() => parseDirectoryBackup(raw, '314:bob', 'mainnet')).toThrow('wallet and network')
    expect(() => parseDirectoryBackup(raw, '314159:alice', 'calibration')).toThrow('wallet and network')
  })

  it('restores Unicode names, nested folders and deletion checkpoints while excluding extra fields', () => {
    const receipt = { transactionHash: `0x${'a'.repeat(64)}`, confirmed: false, remaining: true }
    const parsed = parseDirectoryBackup(
      backupFor({
        ...record,
        privateKey: 'not-a-directory-field',
        deletion: { '1': { ...receipt, secret: 'excluded' } },
      }),
      '314:alice',
      'mainnet'
    )
    expect(parsed.folders).toEqual(['reports', 'reports/2026'])
    expect(parsed.files[0]).toMatchObject(record)
    expect(parsed.files[0].deletion).toEqual({ '1': receipt })
    expect(parsed.files[0]).not.toHaveProperty('privateKey')
  })

  it.each([
    { datasetIds: [] },
    { datasetId: '-1' },
    { datasetId: '9007199254740993' },
    { datasetIds: ['1', '1'] },
    { datasetIds: ['2', '1'] },
    { providerIds: ['1', '2'] },
    { pieceCid: record.cid },
    { fileName: ' ' },
    { pieceId: -1 },
    { deletion: { '2': { transactionHash: `0x${'a'.repeat(64)}`, confirmed: true } } },
  ])('rejects malformed storage references without accepting a partial directory: %j', (invalid) => {
    expect(() => parseDirectoryBackup(backupFor({ ...record, ...invalid }), '314:alice', 'mainnet')).toThrow()
  })
})

describe('empty folder removal', () => {
  const scope = '314:alice'
  it('removes only the selected empty leaf, preserving its parent and other wallets', async () => {
    await saveFolders(scope, ['reports/2026', 'reports/2027'])
    await saveFolders('314:bob', ['reports/2026'])
    await deleteEmptyFolder(scope, 'reports/2026')
    expect(readFolders(scope)).toEqual(['reports', 'reports/2027'])
    expect(readFolders('314:bob')).toEqual(['reports', 'reports/2026'])
    await expect(deleteEmptyFolder(scope, '')).rejects.toThrow('root')
  })
  it('rejects folders containing files or subfolders without altering their records', async () => {
    await saveFolders(scope, ['reports/2026'])
    await expect(deleteEmptyFolder(scope, 'reports')).rejects.toThrow('not empty')
    setCachedPieces(scope, [record])
    await expect(deleteEmptyFolder(scope, 'reports/2026')).rejects.toThrow('not empty')
    expect(readFolders(scope)).toEqual(['reports', 'reports/2026'])
  })
  it('checks the latest file directory after a competing writer releases the lock', async () => {
    await saveFolders(scope, ['reports/2026'])
    let release!: () => void
    let acquired!: () => void
    const ready = new Promise<void>((resolve) => {
      acquired = resolve
    })
    const holding = navigator.locks.request(`filecoin-drive-directory-${scope}`, async () => {
      acquired()
      await new Promise<void>((resolve) => {
        release = resolve
      })
    })
    await ready
    const writing = mutateCachedPieces(scope, () => [record])
    const removal = expect(deleteEmptyFolder(scope, 'reports/2026')).rejects.toThrow('not empty')
    release()
    await holding
    await writing
    await removal
    expect(readFolders(scope)).toContain('reports/2026')
  })
  it('refuses to treat a corrupt file directory as an empty folder', async () => {
    await saveFolders(scope, ['empty'])
    localStorage.setItem(`filecoin-pin-piece-cache-v1-${scope}`, '{broken')
    await expect(deleteEmptyFolder(scope, 'empty')).rejects.toThrow()
    expect(readFolders(scope)).toEqual(['empty'])
  })
})

it('preserves the CAR download mode in directory transfers and rejects malformed flags', () => {
  expect(
    parseDirectoryBackup(backupFor({ ...record, importedCar: true }), '314:alice', 'mainnet').files[0].importedCar
  ).toBe(true)
  expect(() => parseDirectoryBackup(backupFor({ ...record, importedCar: 'yes' }), '314:alice', 'mainnet')).toThrow(
    'CAR import flag'
  )
})
