import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ComponentProps, useState } from 'react'
import type { StepState } from '@/types/upload/step.ts'
import { UploadStatus } from './upload-status.tsx'

const pinnedStepStates: StepState[] = [
  {
    step: 'creating-car',
    progress: 100,
    status: 'completed',
  },
  {
    step: 'checking-readiness',
    progress: 100,
    status: 'completed',
  },
  {
    step: 'uploading-car',
    progress: 100,
    status: 'completed',
  },
  {
    step: 'announcing-cids',
    progress: 100,
    status: 'completed',
  },
  {
    step: 'finalizing-transaction',
    progress: 100,
    status: 'completed',
  },
]

const meta = {
  title: 'Upload/UploadedFileCard',
  component: UploadStatus,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof UploadStatus>

export default meta

type Story = StoryObj<typeof meta>

export const PinnedWithLongNames: Story = {
  args: {
    fileName: 'bafybeigdwdcezmpydxzqnp6svw43m3gnaw247cmhde5a6a4k2n3rpxxylq',
    fileSize: '2.13 MB',
    stepStates: pinnedStepStates,
    cid: 'bafybeigoflpi43gpwuf2i2srflxdkgtsxmvwqcrfruaceuju3kmlzoigzm',
    transactionHash: '0xf85d7c38321ce4a4c3d0fac4a5347f20a2f9596da5120df28b1190ac0948ad77',
    pieceCid: 'baga6ea4seaqfoztqwvslmx6ptxvzopg4g6n5do2br36exlo6ylsyu7akdcm5sdy',
    datasetId: 'filecoin-saturn-dataset-id-0123456789abcdef',
    isExpanded: false,
  },
  render: (args) => (
    <div className="max-w-xl">
      <UploadStatus {...args} />
    </div>
  ),
}

export const PinnedCollapsedLongText: Story = {
  args: {
    fileName: 'Lighthouse-Report-with-very-long-title-and-extra-descriptive-details-v2.1.0.pdf',
    fileSize: '1.76 MB',
    stepStates: pinnedStepStates,
    cid: 'bafybeigdwdcezmpydxzqnp6svw43m3gnaw247cmhde5a6a4k2n3rpxxylq',
    transactionHash: '0xfb3d2a9b2aa5f83aca1f8235f8c5e215aa2cc1cb8e7c7a57f8b7e5d49f74e51d',
    pieceCid: 'baga6ea4seaqbbk6zc3xnenj4hm5whyyqj43sci4yrr3kp5vyu6gwyrpfc7uxkci',
    datasetId: 'filecoin-pin-dataset-id-00000000000000000000000000000001',
    isExpanded: false,
  },
  render: (args) => (
    <div className="max-w-xl">
      <UploadStatus {...args} />
    </div>
  ),
}

export const PinnedShowcase: Story = {
  args: {
    fileName: 'bafybeigdwdcezmpydxzqnp6svw43m3gnaw247cmhde5a6a4k2n3rpxxylq',
    fileSize: '2.13 MB',
    stepStates: pinnedStepStates,
    cid: 'bafybeigoflpi43gpwuf2i2srflxdkgtsxmvwqcrfruaceuju3kmlzoigzm',
    transactionHash: '0xf85d7c38321ce4a4c3d0fac4a5347f20a2f9596da5120df28b1190ac0948ad77',
    pieceCid: 'baga6ea4seaqfoztqwvslmx6ptxvzopg4g6n5do2br36exlo6ylsyu7akdcm5sdy',
    datasetId: 'filecoin-saturn-dataset-id-0123456789abcdef',
    isExpanded: false,
  },
  render: () => {
    const [containerWidth, setContainerWidth] = useState(640)

    const cards: Array<ComponentProps<typeof UploadStatus>> = [
      {
        fileName: 'bafybeigdwdcezmpydxzqnp6svw43m3gnaw247cmhde5a6a4k2n3rpxxylq',
        fileSize: '2.13 MB',
        stepStates: pinnedStepStates,
        cid: 'bafybeigoflpi43gpwuf2i2srflxdkgtsxmvwqcrfruaceuju3kmlzoigzm',
        transactionHash: '0xf85d7c38321ce4a4c3d0fac4a5347f20a2f9596da5120df28b1190ac0948ad77',
        pieceCid: 'baga6ea4seaqfoztqwvslmx6ptxvzopg4g6n5do2br36exlo6ylsyu7akdcm5sdy',
        datasetId: 'filecoin-saturn-dataset-id-0123456789abcdef',
        isExpanded: false,
      },
      {
        fileName: 'Lighthouse-Report-with-very-long-title-and-extra-descriptive-details-v2.1.0.pdf',
        fileSize: '1.76 MB',
        stepStates: pinnedStepStates,
        cid: 'bafybeigdwdcezmpydxzqnp6svw43m3gnaw247cmhde5a6a4k2n3rpxxylq',
        transactionHash: '0xfb3d2a9b2aa5f83aca1f8235f8c5e215aa2cc1cb8e7c7a57f8b7e5d49f74e51d',
        pieceCid: 'baga6ea4seaqbbk6zc3xnenj4hm5whyyqj43sci4yrr3kp5vyu6gwyrpfc7uxkci',
        datasetId: 'filecoin-pin-dataset-id-00000000000000000000000000000001',
        isExpanded: false,
      },
      {
        fileName: 'DataCap-Request-2025-Q4-Final-Report-with-additional-context-and-notes.txt',
        fileSize: '980 KB',
        stepStates: pinnedStepStates,
        cid: 'bafybeihdwdjfep5sfrzcnq6xv444n3gnac247cmhde5a6a4k2n3rpddlpq',
        transactionHash: '0x4b7d0124e5a1d2c398cba4fb3e8adf7a1c2ccc7ab9ca5559a53fba6d04d332ef',
        pieceCid: 'baga6ea4seaq64n0dx31syj5f66j806kb3q3gulwk5cnlhfpa4hf6do2b7jzi4hq',
        datasetId: 'dataset-very-long-id-that-keeps-going-to-test-layout-1234567890',
        isExpanded: false,
      },
    ]

    return (
      <div className="space-y-4">
        <label className="flex flex-col gap-2 text-sm text-zinc-300" htmlFor="uploaded-card-width">
          <span>Container width: {containerWidth}px</span>
          <input
            id="uploaded-card-width"
            max={1024}
            min={320}
            onChange={(event) => setContainerWidth(Number(event.target.value))}
            step={16}
            type="range"
            value={containerWidth}
          />
        </label>

        <div className="space-y-6" style={{ width: containerWidth }}>
          {cards.map((card, index) => (
            <UploadStatus key={card.cid ?? index} {...card} />
          ))}
        </div>
      </div>
    )
  },
}
