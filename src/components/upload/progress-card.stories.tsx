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
