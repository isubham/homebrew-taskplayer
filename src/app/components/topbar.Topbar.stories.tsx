import type { Meta, StoryObj } from '@storybook/react';

import { Topbar } from './topbar';

const meta = {
  component: Topbar,
} satisfies Meta<typeof Topbar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {}
};