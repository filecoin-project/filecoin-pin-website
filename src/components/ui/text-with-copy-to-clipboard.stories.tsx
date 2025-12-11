import type { Meta, StoryObj } from '@storybook/react-vite'

// import { fn } from 'storybook/test';

import { TextWithCopyToClipboard } from './text-with-copy-to-clipboard.tsx'

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
  title: 'TextWithCopyToClipboard',
  component: TextWithCopyToClipboard,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'centered',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  argTypes: {
    text: { control: 'text' },
    href: { control: 'text' },
    prefix: { control: 'text' },
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
  args: {
    text: 'bafy2bzacec3x7q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q',
    href: 'https://filecoin-testnet.blockscout.com/tx/bafy2bzacec3x7q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q',
  },
} satisfies Meta<typeof TextWithCopyToClipboard>

export default meta
type Story = StoryObj<typeof meta>

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const TransactionHash: Story = {
  args: {
    text: 'bafy2bzacec3x7q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q',
    href: 'https://filecoin-testnet.blockscout.com/tx/bafy2bzacec3x7q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q3q5q',
    prefix: 'tx:',
  },
}

export const WithoutLink: Story = {
  args: {
    text: 'bafybeihqokbvl3f3ygley5lwxcmffume5xxon5skwyhvaoykqjw3c6uolu',
    href: undefined,
  },
}
