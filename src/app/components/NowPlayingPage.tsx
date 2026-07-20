import { useState, useEffect, type CSSProperties } from "react";
import { fmt, fmtHM, fmtEst, repeatingTaskOccursOn } from "../utils.jsx";
import { useApp } from "../context/AppContext.jsx";
import { SESSION_PLAYBACK_COPY, TASK_REPEAT_COPY, UNTAGGED_LIST_COLOR } from "../constants.jsx";
import { SessionBreakdown } from "./session-breakdown";
import { useSessionNow } from "../hooks/use-session-now";

export function NowPlayingPage() {
  const { state, helpers, actions } = useApp();
  const run = state.S?.run;
  const sessionNow = useSessionNow(run?.activeSessionId);
  const logicalSession = helpers.currentLogicalSession();
  const running = run?.activeTaskId && run.phase ? state.S.tasks.find(t => t.id === run.activeTaskId) : null;
  let task = running || (run?.lastTaskId ? state.S.tasks.find(t => t.id === run.lastTaskId) : null);
  if (!running && task?.completedAt) task = null;

  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (task) {
      setNotes(task.description || "");
    }
  }, [task?.id, task?.description]);

  if (!task) {
    return (
      <div className="focus-empty">
        <div className="focus-empty-icon">▤</div>
        <h1>Nothing playing</h1>
        <p>Start a task from its row, then open its title here.</p>
      </div>
    );
  }

  const listItem = state.S.lists.find(l => l.id === task.listId) || { id: task.listId, name: "Unsorted", emoji: "▤", color: UNTAGGED_LIST_COLOR };

  const nowPlayingStatus = () => {
    if (!running) return "Paused";
    if (run.phase === "break") return run.longBreak ? "Long break" : "Break";
    if (run.phase === "work") return "Recording";
    return "Waiting";
  };

  const nowPlayingStatusTone = () => {
    if (!running || (run.phase !== "work" && run.phase !== "break")) return "neutral";
    return run.phase === "break" ? "break" : "work";
  };

  const renderCurrentSessionProgress = () => {
    const config = state.S.config;
    if (!running) {
      return (
        <section className="focus-progress-section">
          <div className="focus-section-label">Current session</div>
          <div className="focus-time">{SESSION_PLAYBACK_COPY.pausedLabel}</div>
          {logicalSession ? <SessionBreakdown focusMs={logicalSession.focusMs} breakMs={logicalSession.breakMs} /> : null}
          <div className="focus-progress-note">Resume from the player when you are ready.</div>
        </section>
      );
    }

    if (run.phase === "break") {
      const target = (run.longBreak ? config.longBreakMin : config.breakMin) * 60000;
      const elapsed = run.breakStart ? Math.max(0, sessionNow - run.breakStart) : 0;
      const pct = Math.min(100, (elapsed / target) * 100);
      return (
        <section className="focus-progress-section">
          <div className="focus-section-label">{run.longBreak ? "Long break" : "Break"}</div>
          <div className="focus-time" role="timer">{fmt(Math.min(elapsed, target))} <span>of {fmt(target)}</span></div>
          <div className="focus-meter break" role="img" aria-label={`${Math.round(pct)}% of break elapsed`}>
            <span style={{ width: `${pct}%` }} />
          </div>
          {logicalSession ? <SessionBreakdown focusMs={logicalSession.focusMs} breakMs={logicalSession.breakMs} /> : null}
          <div className="focus-progress-note">The player keeps the break controls within reach.</div>
        </section>
      );
    }

    if (run.phase === "awaiting_break" || run.phase === "awaiting_work") {
      const waitingFor = run.phase === "awaiting_break" ? "Break ready" : "Work ready";
      return (
        <section className="focus-progress-section">
          <div className="focus-section-label">Current session</div>
          <div className="focus-time">{waitingFor}</div>
          <div className="focus-progress-note">This is a compatibility state from an older client. Continue from the player.</div>
        </section>
      );
    }

    const liveSegmentMs = run.runningStart ? Math.max(0, sessionNow - run.runningStart) : 0;
    const elapsed = config.mode === "pomodoro"
      ? (run.pomodoroWorkMs || 0) + liveSegmentMs
      : logicalSession?.focusMs ?? liveSegmentMs;
    if (config.mode === "open") {
      return (
        <section className="focus-progress-section">
          <div className="focus-section-label">Open session</div>
          <div className="focus-time" role="timer">{fmt(elapsed)}</div>
          <div className="focus-open-ruler" aria-label="Open session has no time target">
            <span /><span /><span /><span /><span />
          </div>
          <div className="focus-progress-note">No target · the clock continues with you.</div>
        </section>
      );
    }

    const target = (config.mode === "pomodoro" ? config.workMin : config.targetMin) * 60000;
    const pct = Math.min(100, (elapsed / target) * 100);
    const reached = elapsed >= target;
    const label = config.mode === "pomodoro"
      ? `Pomodoro · cycle ${run.cyclesCompleted + 1} of ${config.cyclesBeforeLongBreak}`
      : "Target session";
    const note = config.mode === "target" && reached
      ? "Target reached · the clock continues."
      : `${Math.round(pct)}% of this ${config.mode === "pomodoro" ? "work block" : "target"}`;

    return (
      <section className="focus-progress-section">
        <div className="focus-section-label">{label}</div>
        <div className="focus-time" role="timer">{fmt(elapsed)} <span>of {fmt(target)}</span></div>
        <div className="focus-meter" style={{ borderColor: reached ? "var(--green)" : undefined }} role="img" aria-label={note}>
          <span className={reached ? "reached-span" : ""} style={{ width: `${pct}%`, backgroundColor: reached ? "var(--green)" : undefined }} />
        </div>
        <div className="focus-progress-note">{note}</div>
      </section>
    );
  };

  const renderTaskProgress = () => {
    const now = sessionNow;
    const working = !!(running && run.phase === "work" && run.runningStart);
    const sessions = helpers.taskSessions(task.id);
    const taskLogicalSessions = helpers.logicalSessions(now).filter((session) => session.taskId === task.id);
    const isDaily = task.cadence === "daily";
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    const scheduledToday = !isDaily || repeatingTaskOccursOn(task, todayStart);
    const relevant = isDaily
      ? sessions.filter((session) => (session.end ?? now) > todayStart)
      : sessions;
    const completedMs = relevant.reduce((sum, session) => {
      const start = isDaily ? Math.max(session.start, todayStart) : session.start;
      return sum + Math.max(0, (session.end ?? now) - start);
    }, 0);
    const liveMs = working ? Math.max(0, now - Math.max(run.runningStart, isDaily ? todayStart : 0)) : 0;
    const total = completedMs + liveMs;
    const count = isDaily
      ? taskLogicalSessions.filter((session) => session.focusIntervals.some((interval) => interval.end > todayStart)).length
      : taskLogicalSessions.length;
    const estimate = !isDaily && task.estimateMin ? task.estimateMin * 60000 : null;
    const pct = estimate ? Math.min(100, (total / estimate) * 100) : null;
    const title = isDaily && !scheduledToday && !working
      ? TASK_REPEAT_COPY.offDayStatus
      : isDaily ? "Today" : "Task progress";
    const time = estimate ? (
      <>
        {fmtHM(total)} <span>of {fmtEst(task.estimateMin)}</span>
      </>
    ) : (
      fmtHM(total)
    );

    return (
      <section className="focus-progress-section focus-task-progress">
        <div className="focus-section-label">{title}</div>
        <div className="focus-time">{time}</div>
        {pct !== null && (
          <div className="focus-meter task" role="img" aria-label={`${fmtHM(total)} of ${fmtEst(task.estimateMin)}`}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="focus-progress-note">{isDaily && !scheduledToday && !working
          ? TASK_REPEAT_COPY.offDayNote
          : <>{count} session{count === 1 ? "" : "s"}{isDaily ? " today" : " recorded"}</>}</div>
      </section>
    );
  };

  return (
    <div className="now-playing-page" style={{ "--accent": listItem.color, "--accent-soft": `${listItem.color}88`, "--accent-softer": `${listItem.color}22` } as CSSProperties}>
      <section className="focus-context-card">
        <div className="focus-identity">
          <div className="focus-cover" style={{ "--cover": listItem.color, "--cover-soft": `${listItem.color}88` } as CSSProperties}>{listItem.emoji}</div>
          <div className="focus-identity-copy">
            <div className="focus-list"><span id="focusListName">{listItem.name}</span> <span aria-hidden="true">›</span></div>
            <h1 id="focusTaskName">{task.name}</h1>
            <div className="focus-status">
              <span id="focusStatusDot" className={`focus-status-dot ${nowPlayingStatusTone()}`} />
              <span id="focusStatus">{nowPlayingStatus()}</span>
            </div>
          </div>
        </div>
        <div className="focus-notes-head"><label htmlFor="focusNotes">Task context</label><span>Saved when you leave the field</span></div>
        <textarea
          id="focusNotes"
          className="focus-notes"
          aria-label="Task context"
          placeholder="Add the goal, where you left off, or useful links…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={(e) => actions.setLyricsInline(task.id, e.target.value)}
        />
      </section>
      <aside className="focus-progress-card" id="focusProgress">
        {renderCurrentSessionProgress()}
        {renderTaskProgress()}
      </aside>
    </div>
  );
}
