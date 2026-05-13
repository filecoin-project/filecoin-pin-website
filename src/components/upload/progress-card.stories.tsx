import type { Meta, StoryObj } from '@storybook/react-vite'
import type { StepState } from '../../types/upload/step.ts'
import { ProgressCard } from './progress-card.tsx'

const meta = {
  title: 'ProgressCard',
  component: ProgressCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    stepState: { control: 'object' },
    transactionHash: { control: 'text' },
  },
} satisfies Meta<typeof ProgressCard>

export default meta
type Story = StoryObj<typeof meta>

// Finalizing transaction with transaction hash
export const FinalizingTransactionWithHash: Story = {
  args: {
    stepState: {
      step: 'finalizing-transaction',
      status: 'in-progress',
      progress: 50,
    } satisfies StepState,
    transactionHash: 'bafy2bzacec3x7q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q',
  },
}

// Finalizing transaction without transaction hash (hash not yet available)
export const FinalizingTransactionWithoutHash: Story = {
  args: {
    stepState: {
      step: 'finalizing-transaction',
      status: 'in-progress',
      progress: 30,
    } satisfies StepState,
  },
}

// Finalizing transaction completed
export const FinalizingTransactionCompleted: Story = {
  args: {
    stepState: {
      step: 'finalizing-transaction',
      status: 'completed',
      progress: 100,
    } satisfies StepState,
    transactionHash: 'bafy2bzacec3x7q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q',
  },
}

// Finalizing transaction with error
export const FinalizingTransactionError: Story = {
  args: {
    stepState: {
      step: 'finalizing-transaction',
      status: 'error',
      progress: 0,
      error: 'Transaction failed: insufficient funds',
    } satisfies StepState,
  },
}

// Other step states for reference
export const CreatingCar: Story = {
  args: {
    stepState: {
      step: 'creating-car',
      status: 'in-progress',
      progress: 45,
    } satisfies StepState,
  },
}

export const AnnouncingCids: Story = {
  args: {
    stepState: {
      step: 'announcing-cids',
      status: 'in-progress',
      progress: 60,
    } satisfies StepState,
  },
}

export const AnnouncingCidsWithWarning: Story = {
  args: {
    stepState: {
      step: 'announcing-cids',
      status: 'error',
      progress: 0,
      error: 'Some CIDs could not be announced to IPNI',
    } satisfies StepState,
  },
}

export const Replicating: Story = {
  args: {
    stepState: {
      step: 'replicating',
      status: 'in-progress',
      progress: 0,
    } satisfies StepState,
  },
}

export const ReplicatingFailed: Story = {
  args: {
    stepState: {
      step: 'replicating',
      status: 'error',
      progress: 0,
      error: 'Secondary copy failed, file stored with reduced redundancy',
    } satisfies StepState,
  },
}

export const FinalizingMultiCopyHalf: Story = {
  args: {
    stepState: {
      step: 'finalizing-transaction',
      status: 'in-progress',
      progress: 50,
    } satisfies StepState,
    confirmedCopies: 1,
    expectedCopies: 2,
    transactionHashes: [
      '0xf85d7c38321ce4a4c3d0fac4a5347f20a2f9596da5120df28b1190ac0948ad77',
      '0xfb3d2a9b2aa5f83aca1f8235f8c5e215aa2cc1cb8e7c7a57f8b7e5d49f74e51d',
    ],
  },
}

export const FinalizingMultiCopyDone: Story = {
  args: {
    stepState: {
      step: 'finalizing-transaction',
      status: 'completed',
      progress: 100,
    } satisfies StepState,
    confirmedCopies: 3,
    expectedCopies: 3,
    transactionHashes: [
      '0xf85d7c38321ce4a4c3d0fac4a5347f20a2f9596da5120df28b1190ac0948ad77',
      '0xfb3d2a9b2aa5f83aca1f8235f8c5e215aa2cc1cb8e7c7a57f8b7e5d49f74e51d',
      '0x4b7d0124e5a1d2c398cba4fb3e8adf7a1c2ccc7ab9ca5559a53fba6d04d332ef',
    ],
  },
}

export const FinalizingMainnet: Story = {
  args: {
    stepState: {
      step: 'finalizing-transaction',
      status: 'in-progress',
      progress: 50,
    } satisfies StepState,
    confirmedCopies: 1,
    expectedCopies: 2,
    network: 'mainnet',
    transactionHashes: [
      '0xf85d7c38321ce4a4c3d0fac4a5347f20a2f9596da5120df28b1190ac0948ad77',
      '0xfb3d2a9b2aa5f83aca1f8235f8c5e215aa2cc1cb8e7c7a57f8b7e5d49f74e51d',
    ],
  },
}
