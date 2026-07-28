import type { Meta, StoryObj } from "@storybook/react";
import { RELATIONSHIPS_AREA_KEY, WORK_AREA_KEY } from "../constants";
import { AppContextValueProvider } from "../context/app-context-value";
import { LifeAreaPage } from "./LifeAreaPage";
import {
  RELATIONSHIPS_STORY_SNAPSHOT,
  WORK_STORY_SNAPSHOT,
  adaptiveStoryHelpers,
} from "./adaptive-area-pages.stories.constants";
import "./main-content.css";
import "./component-stories.css";
import "./life-area-page.css";

function AdaptiveAreaStory({ areaKey }) {
  const snapshot = areaKey === WORK_AREA_KEY ? WORK_STORY_SNAPSHOT : RELATIONSHIPS_STORY_SNAPSHOT;
  const contextValue = {
    state: { S: snapshot, activeAreaKey: areaKey },
    helpers: adaptiveStoryHelpers(snapshot),
    actions: {
      addList: () => undefined,
      addTask: () => undefined,
      navigate: () => undefined,
      play: () => undefined,
      selectList: () => undefined,
      setOpenTaskId: () => undefined,
      toggleDone: () => undefined,
      logRoutineToday: () => undefined,
    },
  };
  return (
    <AppContextValueProvider value={contextValue}>
      <main className="main health-area-story-frame"><LifeAreaPage /></main>
    </AppContextValueProvider>
  );
}

const meta = {
  component: AdaptiveAreaStory,
  args: { areaKey: RELATIONSHIPS_AREA_KEY },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AdaptiveAreaStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Relationships: Story = {};
export const Work: Story = { args: { areaKey: WORK_AREA_KEY } };
