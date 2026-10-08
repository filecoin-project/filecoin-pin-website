import { describe, expect, it } from 'vitest'
import { directoryFolders, normalizeFolder, parseDirectoryBackup, readFolders, saveFolders } from './drive-directory.ts'

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
  it('keeps folders separate across wallets and networks', () => {
    saveFolders('314:alice', ['reports/2026'])
    expect(readFolders('314:alice')).toEqual(['reports', 'reports/2026'])
    expect(readFolders('314:bob')).toEqual([])
    expect(readFolders('314159:alice')).toEqual([])
  })
  it('builds parent folders and rejects traversal paths', () => {
    expect(directoryFolders([], ['a/b/c', 'a/b'])).toEqual(['a', 'a/b', 'a/b/c'])
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
