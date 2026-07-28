import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { AppContextValueProvider } from "../context/app-context-value";
import { HEALTH_AREA_KEY, SESSION_COPY } from "../constants";
import { routineSessionDraft } from "../routine-session";
import { AddSessionModal } from "./add-session-modal";
import { HealthAreaPage } from "./HealthAreaPage";
import { GoalModal } from "./goal-modal";
import {
  HEALTH_STORY_EMPTY_SNAPSHOT,
  HEALTH_STORY_SNAPSHOT,
  healthStoryLogicalSessions,
  healthStoryTaskSessions,
  healthStoryTaskTotal,
} from "./health-area-page.stories.constants";
import "./main-content.css";
import "./component-stories.css";
import "./life-area-page.css";
import "./overlays.css";

function HealthAreaStory({ empty, editor }) {
  const snapshot = empty ? HEALTH_STORY_EMPTY_SNAPSHOT : HEALTH_STORY_SNAPSHOT;
  const [dialog, setDialog] = useState(null);
  const [dialogSession, setDialogSession] = useState(null);
  const logRoutineToday = (taskId) => {
    const task = snapshot.tasks.find((item) => item.id === taskId);
    setDialogSession(routineSessionDraft(task));
    setDialog({
      type: "session",
      title: SESSION_COPY.routineTitle,
      confirmText: SESSION_COPY.routineButton,
      subtitle: SESSION_COPY.routineSubtitle,
    });
  };
  const contextValue = {
    state: {
      S: snapshot,
      activeAreaKey: HEALTH_AREA_KEY,
      activeListId: snapshot.lists[0]?.id || null,
      newTaskDefaults: { areaKey: null, cadence: null },
      openGoalId: editor ? "sleep-better" : null,
      dialog,
      dialogSession,
    },
    helpers: {
      attentionTasks: () => snapshot.tasks.filter((task) => task.deadlineAt),
      logicalSessions: healthStoryLogicalSessions,
      taskSessions: healthStoryTaskSessions,
      taskTotal: healthStoryTaskTotal,
    },
    actions: {
      addList: () => undefined,
      addTask: () => undefined,
      navigate: () => undefined,
      play: () => undefined,
      selectList: () => undefined,
      setOpenTaskId: () => undefined,
      setOpenGoalId: () => undefined,
      toggleDone: () => undefined,
      saveGoal: () => undefined,
      archiveGoal: () => undefined,
      uiConfirm: () => Promise.resolve(true),
      logRoutineToday,
      resolveDialog: () => setDialog(null),
    },
    setDialogSession,
  };

  return (
    <AppContextValueProvider value={contextValue}>
      <>
        <main className="main health-area-story-frame">
          <HealthAreaPage />
        </main>
        {editor ? <GoalModal /> : null}
        {dialog ? <AddSessionModal /> : null}
      </>
    </AppContextValueProvider>
  );
}

const meta = {
  component: HealthAreaStory,
  args: { empty: false, editor: false },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HealthAreaStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = { args: { empty: true } };
export const GoalEditor: Story = { args: { editor: true } };
