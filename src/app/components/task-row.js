import { html } from "../../vendor/lit-html.js";
import { buildCapacityBar, deadlineDate, fmtHM, jewelPayout, LIFE_AREAS } from "../utils.js";
import { playingEqualizer } from "./playing-equalizer.js";

const gripIcon = () => html`
  <svg viewBox="0 0 10 16" width="8" height="14" fill="currentColor" aria-hidden="true">
    <circle cx="2" cy="2" r="1.3"></circle><circle cx="8" cy="2" r="1.3"></circle>
    <circle cx="2" cy="8" r="1.3"></circle><circle cx="8" cy="8" r="1.3"></circle>
    <circle cx="2" cy="14" r="1.3"></circle><circle cx="8" cy="14" r="1.3"></circle>
  </svg>`;

const jewelPayoutTemplate = ({ payout, areaColor, daily }) => {
  if (!payout) return null;
  const title = `${payout.amount > 0 ? "+" : ""}${payout.amount}${daily ? " for today's session" : ""}`;
  return html`
    <span class="jewel-group${payout.amount < 0 ? " neg" : ""}" title=${title}>
      ${payout.amount < 0 ? html`<span class="jewel-sign">−</span>` : null}
      ${Array.from({ length: Math.abs(payout.amount) }, () => html`
        <i class="jewel-dot${payout.amount < 0 ? " neg" : ""}"
           style=${payout.amount > 0 && areaColor ? `background:${areaColor}` : null}></i>`)}
    </span>`;
};

const capacityBar = (bar) => html`
  <span class="capbar" title=${bar.title}>
    <span class="chips">
      ${bar.segments.map((segment) => html`<i class="seg ${segment.cls}" style=${`width:${segment.widthPx.toFixed(1)}px`}></i>`)}
    </span>
    <span class="readout">
      ${bar.totalText}
      ${bar.over
        ? html`<span class="over-tag">+${bar.overText} over</span>`
        : html`<span class="sep"></span><span class="est-part">${bar.estimateText}</span>`}
    </span>
  </span>`;

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

export const taskTableHead = () => html`
  <thead><tr><th class="idx">#</th><th>Task</th><th class="r sess-cell">Sessions</th><th class="r">Progress</th><th class="menu-cell"></th></tr></thead>`;

export function taskRow({ state, task, index, listItem, taskSessions, taskTotal, attentionTaskIds, context = "list" }) {
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
  const todaySessions = daily ? taskSessions(task.id).filter((session) => session.start >= todayStart) : [];
  const todayMs = todaySessions.reduce((sum, session) => sum + ((session.end ?? Date.now()) - session.start), 0)
    + (daily && working && run.runningStart >= todayStart ? Date.now() - run.runningStart : 0);
  const todaySessionCount = todaySessions.length + (daily && working && run.runningStart >= todayStart ? 1 : 0);
  const sessionCount = bar ? bar.sessionCount : durations.length;
  const inDailyJam = context === "dailyJam";
  const fixedTime = daily ? dailyTimeLabel(task) : "";

  const sessionsCell = daily
    ? todaySessionCount
      ? html`<span class="sess-count today-done" title="${todaySessionCount} session${todaySessionCount === 1 ? "" : "s"} logged today">${todaySessionCount}</span>`
      : html`<span class="sess-count sess-count-empty" title="No session logged today">–</span>`
    : sessionCount
      ? html`<span class="sess-count" title="${bar ? bar.sessionLabel : `${sessionCount} session${sessionCount === 1 ? "" : "s"}`} logged">${sessionCount}</span>`
      : html`<span class="sess-count sess-count-empty" title="No sessions logged yet">–</span>`;

  const progress = daily
    ? html`<span class="rbar-status">${fixedTime ? `${fixedTime} · ` : ""}${onBreak ? "on break" : todayMs > 0 ? `${fmtHM(todayMs)} today` : "Not yet today"}</span>`
    : onBreak
      ? html`<span class="rbar-status">on break</span>`
      : bar ? capacityBar(bar) : html`<span class="rbar-status">${fmtHM(taskTotal(task.id))}</span>`;

  const payout = jewelPayout(task);
  const payoutTitle = payout ? `${payout.amount > 0 ? "+" : ""}${payout.amount}` : "";
  const payoutWhen = daily ? " for today's session" : "";
  const areaColor = owner.lifeArea ? LIFE_AREAS.find((area) => area.key === owner.lifeArea)?.color : null;
  const attention = attentionTaskIds?.has(task.id) && task.deadlineAt;
  const daysLeft = attention ? (task.deadlineAt - Date.now()) / 86400000 : null;
  const deadlinePct = attention ? Math.round(Math.max(0, Math.min(1, 1 - daysLeft / 7)) * 100) : 0;
  const playTitle = elsewhere
    ? `Playing on ${run.deviceName || "another device"} — click to play here`
    : `Click to ${active ? "stop" : "start"}${payoutTitle ? ` — earns ${payoutTitle}${payoutWhen}` : ""}`;

  return html`
    <tr class=${`${active ? "playing" : ""}${inDailyJam && todaySessionCount ? " daily-done" : ""}`}
        draggable=${inDailyJam ? "false" : "true"} data-drag-id=${inDailyJam ? null : task.id} data-list-id=${owner.id}
        data-album=${task.album || ""} data-action=${inDailyJam ? "searchGoTask" : null} data-id=${inDailyJam ? task.id : null}
        title=${inDailyJam ? `Open ${task.name}` : "Drag to reorder"}>
      <td class="idx">
        ${inDailyJam ? null : html`<span class="grip" title="Drag to reorder">${gripIcon()}</span>`}
        <span class="num">${working ? playingEqualizer({ className: "task-playing-equalizer" }) : onBreak ? "☕" : index + 1}</span>
        <button class="go" data-action="play" data-id=${task.id} data-stop-propagation="true" title=${playTitle}>${active && !elsewhere ? "⏸" : "▶"}</button>
      </td>
      <td class="tname">
        <div class="task-name-line">
          ${task.name}${task.depth ? html`<span class="tag ${task.depth}">${task.depth}</span>` : null}
          ${jewelPayoutTemplate({ payout, areaColor, daily })}
        </div>
        ${inDailyJam ? html`<div class="task-row-list-name">${owner.name}</div>` : null}
        ${attention ? html`
          <div class="task-attention-cue" title="Deadline cue; derived from deadline, impact, and recent activity">
            <span class="task-deadline-track" role="img" aria-label=${`${deadlinePct}% of the final week elapsed`}><span style=${`width:${deadlinePct}%`}></span></span>
            <span>${deadlineDate(task.deadlineAt)}</span>
          </div>` : null}
      </td>
      <td class="r sess-cell">${sessionsCell}</td>
      <td class="r bar-cell">${progress}</td>
      <td class="menu-cell"><button class="menu-btn" title="More" data-action="openRowMenu" data-id=${task.id} data-stop-propagation="true">⋯</button></td>
    </tr>`;
}
