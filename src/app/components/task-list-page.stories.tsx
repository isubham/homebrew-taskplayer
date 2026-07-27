import type { Meta, StoryObj } from "@storybook/react";
import { DragDropContext } from "@hello-pangea/dnd";
import { AppContextValueProvider } from "../context/app-context-value";
import { TaskListPage } from "./task-list-page";
import {
  COMPONENT_STORY_ACTIONS,
  COMPONENT_STORY_IDLE_RUN,
  COMPONENT_STORY_LABELS,
  COMPONENT_STORY_LIST,
  COMPONENT_STORY_LOGICAL_SESSIONS,
  COMPONENT_STORY_TASKS,
  componentStoryList,
  componentStoryTaskSessions,
  componentStoryTaskTotal,
} from "./component-stories.constants";
import "./main-content.css";
import "./component-stories.css";

function TaskListStory({ completedOpen }) {
  const state = {
    completedOpen,
    S: {
      run: COMPONENT_STORY_IDLE_RUN,
      deviceId: COMPONENT_STORY_IDLE_RUN.deviceId,
      plannedSessions: [],
    },
  };
  const contextValue = {
    actions: {
      ...COMPONENT_STORY_ACTIONS,
      setCompletedOpen: () => undefined,
    },
    helpers: {
      list: componentStoryList,
      logicalSessions: () => COMPONENT_STORY_LOGICAL_SESSIONS,
      recentTasks: () => [],
    },
  };

  return (
    <AppContextValueProvider value={contextValue}>
      <DragDropContext onDragEnd={() => undefined}>
        <main className="main task-list-story-frame" aria-label={COMPONENT_STORY_LABELS.taskList}>
          <TaskListPage
            state={state}
            listItem={COMPONENT_STORY_LIST}
            all={COMPONENT_STORY_TASKS}
            taskSessions={componentStoryTaskSessions}
            taskTotal={componentStoryTaskTotal}
            listTotal={() => componentStoryTaskTotal("write-brief") + componentStoryTaskTotal("research")}
            listEstimateTotal={() => 125}
            attentionTaskIds={new Set(["write-brief"])}
          />
        </main>
      </DragDropContext>
    </AppContextValueProvider>
  );
}

const meta = {
  component: TaskListStory,
  args: {
    completedOpen: false,
  },
} satisfies Meta<typeof TaskListStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CompletedExpanded: Story = {
  args: {
    completedOpen: true,
  },
};
