import type { Meta, StoryObj } from '@storybook/react-vite'
import { BadgeReplication } from './badge-replication.tsx'

const meta = {
  title: 'UI/BadgeReplication',
  component: BadgeReplication,
  parameters: { layout: 'centered' },
  argTypes: {
    copyCount: { control: { type: 'number', min: 0, max: 5 } },
  },
} satisfies Meta<typeof BadgeReplication>

export default meta
type Story = StoryObj<typeof meta>

export const Degraded: Story = {
  args: { copyCount: 1 },
}

export const Replicated2x: Story = {
  args: { copyCount: 2 },
}

export const Replicated3x: Story = {
  args: { copyCount: 3 },
}

export const Hidden: Story = {
  args: { copyCount: 0 },
  parameters: { docs: { description: { story: 'Renders nothing for copyCount <= 0.' } } },
}
