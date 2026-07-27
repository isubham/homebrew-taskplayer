import { LOGICAL_SESSION_STATUS, RECENT_TASKS_COPY, SESSION_PLAYBACK_COPY, TIMER_PLAY_TRIGGERS } from "../constants";
import { timeAgo } from "../utils";
import { useApp } from "../context/app-context-value";
import { SessionBreakdown } from "./session-breakdown";

export function RecentTaskCards({ entries, showListName = false }) {
  const { actions, helpers } = useApp();

  return (
    <div className="jb-grid">
      {entries.length ? entries.map(({ task, at, live, ongoing, logicalSession }) => {
        const listItem = helpers.list(task.listId);
        const status = live
          ? <span style={{ color: "var(--green)" }}>{SESSION_PLAYBACK_COPY.recordingNowLabel}</span>
          : ongoing
            ? <span>{logicalSession?.status === LOGICAL_SESSION_STATUS.break
              ? SESSION_PLAYBACK_COPY.breakLabel
              : SESSION_PLAYBACK_COPY.pausedLabel}</span>
            : timeAgo(at);
        return (
          <div
            key={task.id}
            className="jb-card"
            onClick={() => {
              if (showListName) actions.selectList(task.listId);
              actions.setOpenTaskId(task.id);
            }}
          >
            <span className="jb-dot" style={{ background: listItem?.color || "var(--muted)" }} />
            <div className="jb-body">
              <div className="jb-name">{task.name}</div>
              <div className="jb-meta">{showListName && listItem ? `${listItem.name} · ` : ""}{status}</div>
              {ongoing && logicalSession
                ? <SessionBreakdown compact focusMs={logicalSession.focusMs} breakMs={logicalSession.breakMs} />
                : null}
            </div>
            <button
              className="jb-play"
              onClick={(event) => {
                event.stopPropagation();
                actions.play(task.id, TIMER_PLAY_TRIGGERS.recentTaskCard);
              }}
              title={live
                ? SESSION_PLAYBACK_COPY.pauseTitle
                : ongoing
                  ? SESSION_PLAYBACK_COPY.resumeTitle
                  : SESSION_PLAYBACK_COPY.startTitle}
            >
              {live ? RECENT_TASKS_COPY.activeSymbol : RECENT_TASKS_COPY.playSymbol}
            </button>
          </div>
        );
      }) : <div className="home-empty">{RECENT_TASKS_COPY.empty}</div>}
    </div>
  );
}
