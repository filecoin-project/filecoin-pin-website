import { expect, it } from 'vitest'
import { metadataBytes, validateDriveMetadata } from './drive-metadata.ts'

it('enforces UTF-8 budgets independently for the name and complete path', () => {
  expect(metadataBytes('研究.txt')).toBe(10)
  expect(validateDriveMetadata(`${'中'.repeat(30)}.pdf`, '中'.repeat(32))).toBe('中'.repeat(32))
  expect(() => validateDriveMetadata(`${'中'.repeat(31)}.pdf`, '')).toThrow('File names')
  expect(() => validateDriveMetadata('a.txt', `${'a'.repeat(48)}/${'a'.repeat(48)}`)).toThrow('folder path')
  expect(validateDriveMetadata('a'.repeat(96), '/a//b/')).toBe('a/b')
  expect(() => validateDriveMetadata('a'.repeat(97), '')).toThrow('File names')
  expect(() => validateDriveMetadata('a', '../b')).toThrow('dot segments')
})
