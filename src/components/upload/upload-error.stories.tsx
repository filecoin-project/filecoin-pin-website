import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import type { useUploadOrchestration } from '../../hooks/use-upload-orchestration.ts'
import { UploadError } from './upload-error.tsx'

const meta = {
  title: 'Upload/UploadError',
  component: UploadError,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof UploadError>

export default meta

type Story = StoryObj<typeof meta>

// Mock orchestration object for error state
const createMockOrchestration = (
  fileName: string = 'image.jpg',
  errorMessage: string = 'Storage context not ready. Failed to initialize storage context. Please try again.'
): ReturnType<typeof useUploadOrchestration> => {
  const mockFile = new File([''], fileName, { type: 'image/jpeg' })

  return {
    uploadedFile: {
      file: mockFile,
      cid: '',
    },
    activeUpload: {
      isUploading: false,
      stepStates: [],
      currentCid: undefined,
      pieceCid: undefined,
      transactionHash: undefined,
      error: errorMessage,
    },
    pendingAutoExpandPieceCids: new Set(),
    dragDropKey: 0,
    startUpload: () => {},
    retryUpload: () => {
      console.log('Retry upload clicked')
    },
    cancelUpload: () => {
      console.log('Cancel upload clicked')
    },
  }
}

export const Responsive: Story = {
  args: {
    orchestration: createMockOrchestration(),
  },
  render: (args) => {
    const [containerWidth, setContainerWidth] = useState(640)

    return (
      <div className="space-y-4">
        <label className="flex flex-col gap-2 text-sm text-zinc-300" htmlFor="error-width">
          <span>Container width: {containerWidth}px</span>
          <input
            id="error-width"
            max={1024}
            min={320}
            onChange={(event) => setContainerWidth(Number(event.target.value))}
            step={16}
            type="range"
            value={containerWidth}
          />
        </label>

        <div style={{ width: containerWidth }}>
          <UploadError orchestration={args.orchestration} />
        </div>
      </div>
    )
  },
}

