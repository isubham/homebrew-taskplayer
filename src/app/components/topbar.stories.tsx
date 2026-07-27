import type { Meta, StoryObj } from "@storybook/react";
import { AppContextValueProvider } from "../context/app-context-value";
import { Topbar } from "./topbar";
import {
  COMPONENT_STORY_ACTIONS,
  COMPONENT_STORY_LABELS,
  COMPONENT_STORY_TOPBAR_STATE,
  componentStoryList,
} from "./component-stories.constants";
import "./component-stories.css";

function TopbarStory({ activeView }) {
  const contextValue = { actions: COMPONENT_STORY_ACTIONS };
  return (
    <AppContextValueProvider value={contextValue}>
      <div className="topbar-story-frame" aria-label={COMPONENT_STORY_LABELS.topbar}>
        <Topbar
          state={COMPONENT_STORY_TOPBAR_STATE}
          list={componentStoryList}
          activeView={activeView}
        />
      </div>
    </AppContextValueProvider>
  );
}

const meta = {
  component: TopbarStory,
  args: {
    activeView: "home",
  },
} satisfies Meta<typeof TopbarStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {};

export const SessionsActive: Story = {
  args: {
    activeView: "insights",
  },
};
