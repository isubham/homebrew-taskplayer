import React from "react";
import "./task-row.css";
import { buildCapacityBar, deadlineDate, fmtHM, jewelPayout, LIFE_AREAS, repeatingTaskOccursOn } from "../utils.jsx";
import { PlayingEqualizer } from "./playing-equalizer.jsx";
import { useApp } from "../context/AppContext.jsx";
import { Draggable } from "@hello-pangea/dnd";
import { PLANNER_VIEW_KEY, TASK_REPEAT_COPY, TIMER_PLAY_TRIGGERS } from "../constants.jsx";
import { TaskPlanningCue } from "./planner/task-planning-cue";

const gripIcon = () => (
  <svg viewBox="0 0 10 16" width="8" height="14" fill="currentColor" aria-hidden="true">
    <circle cx="2" cy="2" r="1.3" /><circle cx="8" cy="2" r="1.3" />
    <circle cx="2" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" />
    <circle cx="2" cy="14" r="1.3" /><circle cx="8" cy="14" r="1.3" />
  </svg>
);

export function JewelPayoutTemplate({ payout, areaColor, daily }) {
  if (!payout) return null;
  const title = `${payout.amount > 0 ? "+" : ""}${payout.amount}${daily ? TASK_REPEAT_COPY.rewardTitleSuffix : ""}`;
  return (
    <span className={`jewel-group${payout.amount < 0 ? " neg" : ""}`} title={title}>
      {payout.amount < 0 ? <span className="jewel-sign">−</span> : null}
      {Array.from({ length: Math.abs(payout.amount) }, (_, i) => (
        <i
          key={i}
          className={`jewel-dot${payout.amount < 0 ? " neg" : ""}`}
          style={payout.amount > 0 && areaColor ? { background: areaColor } : undefined}
        />
      ))}
    </span>
  );
}

export function CapacityBar({ bar }) {
  return (
    <span className="capbar" title={bar.title}>
      <span className="chips">
        {bar.segments.map((segment, index) => (
          <i
            key={index}
            className={`seg ${segment.cls}`}
            style={{ width: `${segment.widthPx.toFixed(1)}px` }}
          />
        ))}
      </span>
      <span className="readout">
        {bar.totalText}
        {bar.over ? (
          <span className="over-tag">+{bar.overText} over</span>
        ) : (
          <>
            <span className="sep" />
            <span className="est-part">{bar.estimateText}</span>
          </>
        )}
      </span>
    </span>
  );
}

const dailyTimeLabel = (task) => {
  const weekday = new Date().getDay() || 7;
  const windows = (task.dailyWindows || [])
    .filter((window) => Number(window.weekday) === weekday)
    .sort((a, b) => Number(a.startMinute) - Number(b.startMinute));
  if (!windows.length) return "";
  const start = new Date(2000, 0, 1, 0, Number(windows[0].startMinute) || 0);
  const label = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return windows.length > 1 ? `${label} +${windows.length - 1}` : label;
};

export function TaskTableHead() {
  return (
    <thead>
      <tr>
        <th className="idx">#</th>
        <th>Task</th>
        <th className="r sess-cell">Sessions</th>
        <th className="r">Progress</th>
      </tr>
    </thead>
  );
}

export function TaskRow({ state, task, index, listItem, taskSessions, taskTotal, attentionTaskIds, attentionReason, context = "list", isDragDisabled = false }) {
  const { actions } = useApp();
  const run = state.S.run;
  const owner = listItem || { id: task.listId, name: "Unsorted", lifeArea: null };
  const active = run.activeTaskId === task.id && run.phase;
  const working = active && run.phase === "work" && run.runningStart;
  const onBreak = active && ["break", "awaiting_break", "awaiting_work"].includes(run.phase);
  const elsewhere = active && run.deviceId && state.S.deviceId && run.deviceId !== state.S.deviceId;

  const durations = taskSessions(task.id).map((session) => (session.end ?? Date.now()) - session.start);
  if (working) durations.push(Date.now() - run.runningStart);
  const bar = task.estimateMin ? buildCapacityBar(durations, task.estimateMin) : null;
  const daily = task.cadence === "daily";
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const scheduledToday = !daily || repeatingTaskOccursOn(task, todayStart);
  const todaySessions = daily ? taskSessions(task.id).filter((session) => session.start >= todayStart) : [];
  const todayMs = todaySessions.reduce((sum, session) => sum + ((session.end ?? Date.now()) - session.start), 0)
    + (daily && working && run.runningStart >= todayStart ? Date.now() - run.runningStart : 0);
  const todaySessionCount = todaySessions.length + (daily && working && run.runningStart >= todayStart ? 1 : 0);
  const sessionCount = bar ? bar.sessionCount : durations.length;
  const inDailyJam = context === "dailyJam";
  const fixedTime = daily ? dailyTimeLabel(task) : "";

  const sessionsCell = daily
    ? todaySessionCount
      ? <span className="sess-count today-done" title={`${todaySessionCount} session${todaySessionCount === 1 ? "" : "s"} logged today`}>{todaySessionCount}</span>
      : <span className="sess-count sess-count-empty" title="No session logged today">–</span>
    : sessionCount
      ? <span className="sess-count" title={`${bar ? bar.sessionLabel : `${sessionCount} session${sessionCount === 1 ? "" : "s"} logged`} logged`}>{sessionCount}</span>
      : <span className="sess-count sess-count-empty" title="No sessions logged yet">–</span>;

  const progress = daily
    ? <span className="rbar-status">{!scheduledToday && !active
      ? TASK_REPEAT_COPY.offDayStatus
      : <>{fixedTime ? `${fixedTime} · ` : ""}{onBreak ? "on break" : todayMs > 0 ? `${fmtHM(todayMs)} today` : "Not yet today"}</>}</span>
    : onBreak
      ? <span className="rbar-status">on break</span>
      : bar ? <CapacityBar bar={bar} /> : <span className="rbar-status">{fmtHM(taskTotal(task.id))}</span>;

  const payout = jewelPayout(task);
  const payoutTitle = payout ? `${payout.amount > 0 ? "+" : ""}${payout.amount}` : "";
  const payoutWhen = daily ? TASK_REPEAT_COPY.rewardTitleSuffix : "";

  const areaColor = owner.lifeArea ? LIFE_AREAS.find((area) => area.key === owner.lifeArea)?.color : null;
  const attention = attentionTaskIds?.has(task.id) && task.deadlineAt;
  const daysLeft = attention ? (task.deadlineAt - Date.now()) / 86400000 : null;
  const deadlinePct = attention ? Math.round(Math.max(0, Math.min(1, 1 - daysLeft / 7)) * 100) : 0;
  const playTitle = elsewhere
    ? `Playing on ${run.deviceName || "another device"} — click to play here`
    : `Click to ${active ? "stop" : "start"}${payoutTitle ? ` — earns ${payoutTitle}${payoutWhen}` : ""}`;

  const handleRowClick = () => {
    if (inDailyJam) {
      actions.selectList(owner.id);
      actions.setOpenTaskId(task.id);
    } else {
      actions.setOpenTaskId(task.id);
    }
  };

  const renderInner = (provided = null, snapshot = null) => (
    <tr
      ref={provided?.innerRef}
      {...(provided?.draggableProps || {})}
      className={`${active ? "playing" : ""}${inDailyJam && todaySessionCount ? " daily-done" : ""}${snapshot?.isDragging ? " dragging" : ""}`}
      title={inDailyJam ? `Open ${task.name}` : undefined}
      onClick={handleRowClick}
      style={{ cursor: "pointer", ...(provided?.draggableProps?.style || {}) }}
    >
      <td className="idx">
        {inDailyJam || isDragDisabled ? null : (
          <span
            className="grip"
            title="Drag to reorder"
            {...(provided?.dragHandleProps || {})}
            onClick={(e) => e.stopPropagation()}
          >
            {gripIcon()}
          </span>
        )}
        <span className="num">
          {working ? <PlayingEqualizer className="task-playing-equalizer" /> : onBreak ? "☕" : index + 1}
        </span>
        <button
          className="go"
          onClick={(e) => {
            e.stopPropagation();
            actions.play(task.id, TIMER_PLAY_TRIGGERS.taskRow);
          }}
          title={playTitle}
        >
          {active && !elsewhere ? "⏸" : "▶"}
        </button>
      </td>
      <td className="tname">
        <div className="task-name-line">
          {task.name}{task.depth ? <span className={`tag ${task.depth}`}>{task.depth}</span> : null}
          <JewelPayoutTemplate payout={payout} areaColor={areaColor} daily={daily} />
        </div>
        {inDailyJam ? <div className="task-row-list-name">{attentionReason || owner.name}</div> : null}
        {attention && !inDailyJam ? (
          <div className="task-attention-cue" title="Deadline cue; derived from deadline, impact, and recent activity">
            <span className="task-deadline-track" role="img" aria-label={`${deadlinePct}% of the final week elapsed`}>
              <span style={{ width: `${deadlinePct}%` }} />
            </span>
            <span>{deadlineDate(task.deadlineAt)}</span>
          </div>
        ) : null}
        {!daily && !task.completedAt ? (
          <TaskPlanningCue
            taskId={task.id}
            plans={state.S.plannedSessions}
            onPlan={(taskId, planId) => actions.navigate({ view: PLANNER_VIEW_KEY, planTaskId: taskId, planSessionId: planId })}
          />
        ) : null}
      </td>
      <td className="r sess-cell">{sessionsCell}</td>
      <td className="r bar-cell">{progress}</td>
    </tr>
  );

  if (inDailyJam || isDragDisabled) {
    return renderInner();
  }

  return (
    <Draggable draggableId={`task:${task.id}`} index={index}>
      {(provided, snapshot) => renderInner(provided, snapshot)}
    </Draggable>
  );
}

export const taskTableHead = () => <TaskTableHead />;
export const taskRow = (props) => <TaskRow {...props} />;
