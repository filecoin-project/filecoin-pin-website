import { expect, it } from 'vitest'
import { driveMetadataLabel, metadataBytes, parseDriveLabel, validateDriveMetadata } from './drive-metadata.ts'

it('enforces UTF-8 budgets independently for the name and complete path', () => {
  expect(metadataBytes('研究.txt')).toBe(10)
  expect(validateDriveMetadata(`${'中'.repeat(30)}.pdf`, '中'.repeat(32))).toBe('中'.repeat(32))
  expect(() => validateDriveMetadata(`${'中'.repeat(31)}.pdf`, '')).toThrow('File names')
  expect(() => validateDriveMetadata('a.txt', `${'a'.repeat(48)}/${'a'.repeat(48)}`)).toThrow('folder path')
  expect(validateDriveMetadata('a'.repeat(96), '/a//b/')).toBe('a/b')
  expect(() => validateDriveMetadata('a'.repeat(97), '')).toThrow('File names')
  expect(() => validateDriveMetadata('a', '../b')).toThrow('dot segments')
})

it('marks directories in the existing label field and strips only valid folder markers', () => {
  expect(driveMetadataLabel('研究', true)).toBe('研究/')
  expect(parseDriveLabel('研究/')).toEqual({ fileName: '研究', isDirectory: true })
  expect(parseDriveLabel('report.pdf')).toEqual({ fileName: 'report.pdf' })
  expect(driveMetadataLabel('report.pdf')).toBe('report.pdf')
  for (const label of [
    '/',
    '../',
    './',
    'a/b/',
    'a//',
    `a${String.fromCharCode(92)}b/`,
    `a${String.fromCharCode(0)}/`,
  ]) {
    expect(parseDriveLabel(label).isDirectory).toBeUndefined()
  }
  expect(parseDriveLabel('2026/').isDirectory).toBe(true)
})
it('reserves one UTF-8 byte for the directory marker without reducing file or path budgets', () => {
  expect(validateDriveMetadata('a'.repeat(95), 'p'.repeat(96), true)).toBe('p'.repeat(96))
  expect(() => validateDriveMetadata('a'.repeat(96), '', true)).toThrow('95 UTF-8')
  expect(validateDriveMetadata(`${'中'.repeat(31)}ab`, '', true)).toBe('')
  expect(() => validateDriveMetadata('中'.repeat(32), '', true)).toThrow('95 UTF-8')
  expect(validateDriveMetadata('a'.repeat(96), '')).toBe('')
})
