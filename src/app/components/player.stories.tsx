import type { Meta, StoryObj } from "@storybook/react";
import { AppContextValueProvider } from "../context/app-context-value";
import { MusicContextValueProvider } from "../context/music-context-value";
import { Player } from "./Player";
import {
  COMPONENT_STORY_ACTIONS,
  COMPONENT_STORY_CONFIG,
  COMPONENT_STORY_IDLE_RUN,
  COMPONENT_STORY_LABELS,
  COMPONENT_STORY_LIST,
  COMPONENT_STORY_LOGICAL_SESSIONS,
  COMPONENT_STORY_MUSIC,
  COMPONENT_STORY_RUNNING_RUN,
  componentStoryList,
  componentStoryTask,
} from "./component-stories.constants";
import "./component-stories.css";

function PlayerStory({ running }) {
  const run = running ? COMPONENT_STORY_RUNNING_RUN : COMPONENT_STORY_IDLE_RUN;
  const contextValue = {
    state: {
      S: {
        run,
        config: COMPONENT_STORY_CONFIG,
        deviceId: run.deviceId,
      },
    },
    helpers: {
      currentLogicalSession: () => running ? COMPONENT_STORY_LOGICAL_SESSIONS[0] : null,
      findTask: componentStoryTask,
      list: componentStoryList,
      modeGlyph: () => "◎",
      modeLabel: () => "Target",
      targetMs: () => COMPONENT_STORY_CONFIG.targetMin * 60_000,
    },
    actions: COMPONENT_STORY_ACTIONS,
  };

  return (
    <AppContextValueProvider value={contextValue}>
      <MusicContextValueProvider value={COMPONENT_STORY_MUSIC}>
        <div className="player-story-frame" aria-label={COMPONENT_STORY_LABELS.player}>
          <Player />
        </div>
      </MusicContextValueProvider>
    </AppContextValueProvider>
  );
}

const meta = {
  component: PlayerStory,
  args: {
    running: false,
  },
} satisfies Meta<typeof PlayerStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Recording: Story = {
  args: {
    running: true,
  },
};
