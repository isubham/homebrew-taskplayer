import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { DragDropContext } from "@hello-pangea/dnd";
import { AppContextValueProvider } from "../context/app-context-value";
import { Sidebar, SidebarListRow } from "./sidebar";
import {
  SIDEBAR_STORY_ACTIVE_LIST_ID,
  SIDEBAR_STORY_ATTENTION_LIST_ID,
  SIDEBAR_STORY_COLLAPSED,
  SIDEBAR_STORY_CONTAINER_LABEL,
  SIDEBAR_STORY_INITIAL_COLLAPSED,
  SIDEBAR_STORY_PLAYING_LIST_ID,
  SIDEBAR_STORY_SECTIONS,
} from "./sidebar.stories.constants";
import "./sidebar.stories.css";

type SidebarStoryProps = {
  collapsed: Record<string, boolean>;
};

function SidebarStory({ collapsed: initialCollapsed }: SidebarStoryProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const appContext = {
    actions: {
      addList: () => undefined,
      selectLifeArea: () => undefined,
    },
    setSidebarCollapsed: setCollapsed,
  };

  const rowForList = (listItem) => (
    <SidebarListRow
      listItem={listItem}
      detail={listItem.name}
      active={listItem.id === SIDEBAR_STORY_ACTIVE_LIST_ID}
      playing={listItem.id === SIDEBAR_STORY_PLAYING_LIST_ID}
      attention={listItem.id === SIDEBAR_STORY_ATTENTION_LIST_ID}
      onClick={() => undefined}
    />
  );

  return (
    <AppContextValueProvider value={appContext}>
      <DragDropContext onDragEnd={() => undefined}>
        <aside className="side sidebar-story-frame" aria-label={SIDEBAR_STORY_CONTAINER_LABEL}>
          <Sidebar
            sections={SIDEBAR_STORY_SECTIONS}
            collapsed={collapsed}
            rowForList={rowForList}
          />
        </aside>
      </DragDropContext>
    </AppContextValueProvider>
  );
}

const meta = {
  component: SidebarStory,
  render: (args) => <SidebarStory {...args} />,
  parameters: {
    layout: "centered",
  },
  args: {
    collapsed: SIDEBAR_STORY_INITIAL_COLLAPSED,
  },
} satisfies Meta<typeof SidebarStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};

export const WithCollapsedSection: Story = {
  args: {
    collapsed: SIDEBAR_STORY_COLLAPSED,
  },
};
