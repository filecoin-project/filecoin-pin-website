import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ setUploading: vi.fn(), refreshWallet: vi.fn(), createCar: vi.fn() }))
const scope = '314:0x1111111111111111111111111111111111111111'
vi.mock('../../context/browser-wallet-provider.tsx', () => ({
  useBrowserWallet: () => ({
    address: scope.slice(4),
    sessionStatus: 'active',
    network: 'mainnet',
    setUploading: mocks.setUploading,
  }),
}))
vi.mock('../../hooks/use-filecoin-pin-context.ts', () => ({
  useFilecoinPinContext: () => ({
    wallet: { status: 'ready', data: { address: scope.slice(4), network: 'mainnet' } },
    storageScope: scope,
    synapse: {},
    storageSetup: { status: 'ready' },
    refreshWallet: mocks.refreshWallet,
  }),
}))
vi.mock('../../lib/filecoin-pin/drive-api.ts', async (original) => ({
  ...(await original<object>()),
  loadDriveFiles: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../lib/filecoin-pin/upload-input.ts', () => ({ prepareUploadInput: mocks.createCar }))
vi.mock('../drive/file-browser.tsx', () => ({
  FileBrowser: ({ onUpload, uploadDisabled }: { onUpload: (location: string) => void; uploadDisabled: boolean }) => (
    <button disabled={uploadDisabled} onClick={() => onUpload('')} type="button">
      Upload files
    </button>
  ),
}))
vi.mock('../drive/wallet-controls.tsx', () => ({ WalletSetup: () => null }))
vi.mock('../upload/drag-n-drop.tsx', () => ({
  default: ({ onUpload }: { onUpload: (file: File) => void }) => (
    <button onClick={() => onUpload(file)} type="button">
      Submit file
    </button>
  ),
}))

import { UploadHistoryProvider } from '../../context/upload-history-context.tsx'
import { UploadTasksProvider } from '../../context/upload-tasks-context.tsx'
import { getCachedPieces, setCachedPieces } from '../../lib/local-storage/piece-cache.ts'
import Content from './content.tsx'

let file: File
beforeEach(() => {
  vi.clearAllMocks()
  setCachedPieces(scope, [])
  file = new File(['test'], 'example.bin')
  mocks.createCar.mockRejectedValue(new Error('Unable to pack file'))
})
it.each(['size limit', 'packing'] as const)(
  'releases the operation lock and allows another upload after an early %s failure',
  async (cause) => {
    if (cause === 'size limit') Object.defineProperty(file, 'size', { value: 200_000_001 })
    render(
      <UploadHistoryProvider>
        <UploadTasksProvider>
          <Content />
        </UploadTasksProvider>
      </UploadHistoryProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Upload files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit file' }))
    await waitFor(() => expect(getCachedPieces(scope)?.[0].upload?.phase).toBe('failed'))
    await waitFor(() => expect(mocks.setUploading).toHaveBeenLastCalledWith(false))
    expect(screen.getByRole('button', { name: 'Upload files' })).toHaveProperty('disabled', false)
    expect(screen.queryByRole('complementary', { name: 'Upload activity' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Upload files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit file' }))
    await waitFor(() => expect(getCachedPieces(scope)).toHaveLength(2))
    await waitFor(() => expect(getCachedPieces(scope)?.every((file) => file.upload?.phase === 'failed')).toBe(true))
    if (cause === 'size limit') expect(mocks.createCar).not.toHaveBeenCalled()
  }
)
