import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  setUploading: vi.fn(),
  refreshWallet: vi.fn(),
  createCar: vi.fn(),
}))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({
    sessionStatus: 'active',
    network: 'mainnet',
    setUploading: mocks.setUploading,
  }),
}))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    wallet: { status: 'ready', data: { network: 'mainnet' } },
    synapse: {},
    storageSetup: { status: 'ready' },
    refreshWallet: mocks.refreshWallet,
  }),
}))
vi.mock('../../context/upload-history-context.tsx', () => ({
  useUploadHistory: () => ({ addUpload: vi.fn() }),
}))
vi.mock('../../lib/filecoin-pin/upload-input.ts', () => ({ prepareUploadInput: mocks.createCar }))
vi.mock('../drive/file-browser.tsx', () => ({
  FileBrowser: ({ onUpload }: { onUpload: () => void }) => (
    <button onClick={onUpload} type="button">
      Upload files
    </button>
  ),
}))
vi.mock('../drive/wallet-controls.tsx', () => ({ WalletSetup: () => null }))
// Bypass file selection to exercise defensive errors in the actual upload hook.
vi.mock('../upload/drag-n-drop.tsx', () => ({
  default: ({ onUpload }: { onUpload: (file: File) => void }) => (
    <button onClick={() => onUpload(file)} type="button">
      Submit file
    </button>
  ),
}))

import Content from './content.tsx'

let file: File
beforeEach(() => {
  vi.clearAllMocks()
  file = new File(['test'], 'example.bin')
  mocks.createCar.mockRejectedValue(new Error('Unable to pack file'))
})

it.each(['size limit', 'packing'] as const)(
  'releases the wallet lock after an early %s failure and retry',
  async (cause) => {
    if (cause === 'size limit') Object.defineProperty(file, 'size', { value: 200_000_001 })
    render(<Content />)
    fireEvent.click(screen.getByRole('button', { name: 'Upload files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit file' }))
    await waitFor(() => expect(mocks.setUploading.mock.calls.map(([value]) => value)).toEqual([true, false]))
    expect(mocks.refreshWallet).toHaveBeenCalledOnce()
    if (cause === 'size limit') expect(mocks.createCar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'View upload details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry Upload' }))
    await waitFor(() =>
      expect(mocks.setUploading.mock.calls.map(([value]) => value)).toEqual([true, false, true, false])
    )
    expect(mocks.refreshWallet).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('complementary', { name: 'Upload activity' })).toBeNull()
  }
)
