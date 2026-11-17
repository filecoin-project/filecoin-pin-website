import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { FileSize } from './file-size.tsx'

it('explains recovered encrypted sizes with an accessible help control', () => {
  render(<FileSize file={{ fileSize: '2 KB', encrypted: true, fileSizeIsStored: true }} />)
  const help = screen.getByRole('button', { name: 'About encrypted file size' })
  fireEvent.focus(help)
  expect(help.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id)
  expect(screen.getByRole('tooltip', { hidden: true }).textContent).toContain('including encryption overhead')
})

it.each([
  { fileSize: '2 KB', encrypted: true },
  { fileSize: '2 KB', encrypted: false, fileSizeIsStored: true },
  { fileSize: 'Unknown', encrypted: true, fileSizeIsStored: true },
  { fileSize: '—', encrypted: true, fileSizeIsStored: true },
])('does not label original, public, or unavailable sizes as encrypted sizes (%j)', (file) => {
  render(<FileSize file={file} />)
  expect(screen.queryByRole('button')).toBeNull()
})
