import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext.jsx";
import {
  LOCAL_NOTES_COPY,
  NOW_PLAYING_COPY,
  TIMER_PHASE,
  UNTAGGED_LIST_COLOR,
} from "../constants.jsx";
import type { RunState, Task } from "../bindings";
import { useLocalStorageSettings } from "../hooks/use-local-storage-settings";

const LocalNotePanel = lazy(() => import("./local-note-panel").then((module) => ({
  default: module.LocalNotePanel,
})));
const MarkdownEditor = lazy(() => import("./markdown-editor").then((module) => ({
  default: module.MarkdownEditor,
})));

function statusFor(run: RunState | undefined, running: Task | null | undefined) {
  if (!run || !running) return { label: NOW_PLAYING_COPY.pausedStatus, tone: "neutral" };
  if (run.phase === TIMER_PHASE.break) {
    return {
      label: run.longBreak ? NOW_PLAYING_COPY.longBreakStatus : NOW_PLAYING_COPY.breakStatus,
      tone: TIMER_PHASE.break,
    };
  }
  if (run.phase === TIMER_PHASE.work) {
    return { label: NOW_PLAYING_COPY.recordingStatus, tone: TIMER_PHASE.work };
  }
  return { label: NOW_PLAYING_COPY.waitingStatus, tone: "neutral" };
}

export function NowPlayingPage() {
  const { state, actions } = useApp();
  const { settings: localStorageSettings } = useLocalStorageSettings();
  const run = state.S?.run;
  const running = run?.activeTaskId && run.phase
    ? state.S.tasks.find((candidate) => candidate.id === run.activeTaskId)
    : null;
  let task = running || (run?.lastTaskId
    ? state.S.tasks.find((candidate) => candidate.id === run.lastTaskId)
    : null);
  if (!running && task?.completedAt) task = null;

  const [taskContent, setTaskContent] = useState("");
  const [localNotesMaximized, setLocalNotesMaximized] = useState(false);

  useEffect(() => {
    setTaskContent(task?.description || "");
    setLocalNotesMaximized(false);
  }, [task?.description, task?.id]);

  if (!task) {
    return (
      <div className="focus-empty">
        <div className="focus-empty-icon">{NOW_PLAYING_COPY.emptyIcon}</div>
        <h1>{NOW_PLAYING_COPY.emptyTitle}</h1>
        <p>{NOW_PLAYING_COPY.emptyDescription}</p>
      </div>
    );
  }

  const listItem = state.S.lists.find((candidate) => candidate.id === task.listId) || {
    id: task.listId,
    name: NOW_PLAYING_COPY.unsortedList,
    emoji: NOW_PLAYING_COPY.emptyIcon,
    color: UNTAGGED_LIST_COLOR,
  };
  const status = statusFor(run, running);
  const accentStyle = {
    "--accent": listItem.color,
    "--accent-soft": `${listItem.color}88`,
  } as CSSProperties;

  return (
    <div className={`now-playing-page${localNotesMaximized ? " local-notes-focus" : ""}`} style={accentStyle}>
      <section className="focus-context-card">
        <header className="focus-identity">
          <div className="focus-cover">{listItem.emoji}</div>
          <div className="focus-identity-copy">
            <div className="focus-playing-label">
              <span className={`focus-status-dot ${status.tone}`} />
              <span>{NOW_PLAYING_COPY.playingLabel}</span>
              <span aria-hidden="true">{NOW_PLAYING_COPY.contextSeparator}</span>
              <span>{listItem.name}</span>
            </div>
            <h1>{task.name}</h1>
            <div className="focus-status">{status.label}</div>
          </div>
        </header>

        <section className="focus-task-content">
          <div className="focus-section-heading">
            <h2>{NOW_PLAYING_COPY.taskContentHeading}</h2>
            <span>{NOW_PLAYING_COPY.taskContentSyncHint}</span>
          </div>
          <Suspense fallback={<div className="markdown-editor-loading" />}>
            <MarkdownEditor
              className="focus-notes-editor"
              ariaLabel={NOW_PLAYING_COPY.taskContentAriaLabel}
              placeholder={NOW_PLAYING_COPY.taskContentPlaceholder}
              vimMode={localStorageSettings?.vimMode || false}
              value={taskContent}
              onChange={setTaskContent}
              onBlur={() => actions.setLyricsInline(task.id, taskContent)}
            />
          </Suspense>
        </section>

        <Suspense fallback={<div className="local-notes-unavailable">{LOCAL_NOTES_COPY.savingStatus}</div>}>
          <LocalNotePanel
            key={task.id}
            taskId={task.id}
            maximized={localNotesMaximized}
            onMaximizedChange={setLocalNotesMaximized}
          />
        </Suspense>
      </section>
    </div>
  );
}
