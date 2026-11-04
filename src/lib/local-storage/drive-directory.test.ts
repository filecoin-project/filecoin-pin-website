import { expect, it } from 'vitest'
import { directoryFolders, normalizeFolder } from './drive-directory.ts'

it('builds parents from stored file paths and rejects traversal', () => {
  expect(directoryFolders([], ['a/b/c', 'a/b'])).toEqual(['a', 'a/b', 'a/b/c'])
  expect(directoryFolders([], ['reports-old', 'reports/2026'])).toEqual(['reports', 'reports/2026', 'reports-old'])
  expect(normalizeFolder('/a//b/')).toBe('a/b')
  expect(() => normalizeFolder('a/../b')).toThrow('dot segments')
})
