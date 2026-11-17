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

for (const phase of ['uploading', 'failed', 'confirming'] as const) {
  for (const detailed of [false, true]) {
    it(`shows N/A for ${phase} without confirmed copies (detailed=${detailed})`, () => {
      render(
        <BadgePrivacy
          detailed={detailed}
          file={{
            encrypted: true,
            upload: {
              phase,
              expectedCopies: 1,
              providers: [],
              steps: [],
              checks: 0,
              nextCheckAt: 0,
            },
          }}
        />
      )
      expect(screen.getByText('N/A').getAttribute('title')).toMatch(/no confirmed stored copy/i)
      expect(screen.queryByText('Public')).toBeNull()
      expect(screen.queryByLabelText('Encrypted')).toBeNull()
      expect(screen.queryByText('Encrypted')).toBeNull()
    })
  }
}

it('keeps the privacy marker for a confirmed copy when another copy fails', () => {
  render(
    <BadgePrivacy
      detailed
      file={{
        encrypted: true,
        copyCount: 1,
        upload: {
          phase: 'failed',
          expectedCopies: 2,
          providers: [],
          steps: [],
          checks: 0,
          nextCheckAt: 0,
        },
      }}
    />
  )
  expect(screen.getByText('Encrypted')).toBeTruthy()
  expect(screen.queryByText('N/A')).toBeNull()
})

it('shows N/A rather than Public when encryption metadata is absent before storage', () => {
  render(
    <BadgePrivacy
      file={{
        copyCount: 0,
        upload: {
          phase: 'failed',
          expectedCopies: 1,
          providers: [],
          steps: [],
          checks: 0,
          nextCheckAt: 0,
        },
      }}
    />
  )
  expect(screen.getByText('N/A')).toBeTruthy()
  expect(screen.queryByText('Public')).toBeNull()
})
