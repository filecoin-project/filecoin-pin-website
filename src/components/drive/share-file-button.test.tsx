import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { ShareFileButton } from './share-file-button.tsx'

const file = {
  id: 'file',
  fileName: 'hello.txt',
  cid: 'bafkreig4nl6nqu64xpwqfimx5bwhcntmpbgbjnly7dzs6u6zkeqfkimtfe',
  pieceCid: 'piece',
  datasetId: '1',
  serviceURL: 'https://sp.example',
} as DatasetPiece
const clipboard = (writeText: ReturnType<typeof vi.fn>) => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  return () => {
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else Reflect.deleteProperty(navigator, 'clipboard')
  }
}
let restore: (() => void) | undefined
afterEach(() => {
  restore?.()
  restore = undefined
})

it('opens without copying and copies the displayed link only when requested', async () => {
  const write = vi.fn().mockResolvedValue(undefined)
  restore = clipboard(write)
  render(<ShareFileButton file={file} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  const dialog = screen.getByRole('dialog', { name: 'Share file' })
  const link = screen.getByRole('textbox', { name: 'Share link' }) as HTMLInputElement
  expect(write).not.toHaveBeenCalled()
  expect(link.value).toContain('.ipfs.inbrowser.link/')
  expect(dialog.querySelector('svg title')?.textContent).toBe('Share link QR code')
  expect(dialog.querySelector('svg path')).toBeTruthy()
  expect(screen.queryByText('Copied!')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(screen.getByText('Copied!')).toBeTruthy())
  expect(write).toHaveBeenCalledOnce()
  expect(write).toHaveBeenCalledWith(link.value)
  fireEvent.click(screen.getByRole('button', { name: 'Close share' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(screen.queryByText('Copied!')).toBeNull()
  expect(write).toHaveBeenCalledOnce()
})

it('keeps the QR code and selectable link available when clipboard permission is denied', async () => {
  const write = vi.fn().mockRejectedValue(new Error('Permission denied'))
  restore = clipboard(write)
  render(<ShareFileButton file={{ ...file, importedCar: true }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveProperty('value', 'https://sp.example/piece/piece')
  await screen.findByText('Scan to download the original CAR archive from its storage provider.')
  expect(write).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(write).toHaveBeenCalledOnce())
  expect(screen.getByRole('textbox', { name: 'Share link' })).toBeTruthy()
  expect(screen.getByText('Copy the link, or scan the QR code.')).toBeTruthy()
  expect(screen.queryByText('Link copied.')).toBeNull()
})
