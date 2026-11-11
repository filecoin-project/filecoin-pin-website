import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { BadgePrivacy } from './badge-privacy.tsx'

it('marks an encrypted file with a quiet lock, not a pill', () => {
  render(<BadgePrivacy file={{ encrypted: true }} />)
  const lock = screen.getByLabelText('Encrypted')
  expect(lock.getAttribute('title')).toMatch(/only your wallet/i)
  // Reassurance, not alarm: no text label on the default state.
  expect(screen.queryByText('Encrypted')).toBeNull()
  expect(screen.queryByText('Public')).toBeNull()
})

it('flags a public file with the loud Public pill', () => {
  render(<BadgePrivacy file={{}} />)
  const pill = screen.getByText('Public')
  expect(pill.closest('[title]')?.getAttribute('title')).toMatch(/anyone with its CID/i)
  expect(screen.queryByLabelText('Encrypted')).toBeNull()
})

it('spells out encryption in the detailed variant used by the details panel', () => {
  render(<BadgePrivacy detailed file={{ encrypted: true }} />)
  const chip = screen.getByText('Encrypted')
  expect(chip.closest('[title]')?.getAttribute('title')).toMatch(/only your wallet/i)
  // The quiet row lock must not render alongside the chip.
  expect(screen.queryByLabelText('Encrypted')).toBeNull()
})

it('keeps the same Public pill in both variants', () => {
  render(<BadgePrivacy detailed file={{}} />)
  expect(screen.getByText('Public')).toBeTruthy()
})
