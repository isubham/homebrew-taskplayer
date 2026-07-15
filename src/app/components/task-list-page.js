import { html } from "../../vendor/lit-html.js";
import { albumColor, fmtHM, fmtLong, fmtEst, LIFE_AREAS } from "../utils.js";
import { groupWeeklyWindows } from "../weekly-schedule.js";
import { stickyHeader } from "./sticky-header.js";
import { taskRow, taskTableHead } from "./task-row.js";

const withEstimate = (timeText, estimateMin) => estimateMin ? `${timeText} of ${fmtEst(estimateMin)}` : timeText;

const taskTable = (tasks, context, className = "albrows") => html`
  <table class=${className}>${taskTableHead()}<tbody>${tasks.map((task, index) => taskRow({ ...context, task, index }))}</tbody></table>`;

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const clockLabel = (minutes) => {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return `${hour}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${suffix}`;
};

const dayRangeLabel = (weekdays = []) => {
  const ordered = [...new Set(weekdays.map(Number))].sort((a, b) => a - b);
  if (ordered.length === 7) return "Every day";
  if (!ordered.length) return "No days";
  const contiguous = ordered.every((day, index) => index === 0 || day === ordered[index - 1] + 1);
  if (contiguous && ordered.length >= 3) return `${DAY_LABELS[ordered[0] - 1]}–${DAY_LABELS[ordered[ordered.length - 1] - 1]}`;
  return ordered.map((day) => DAY_LABELS[day - 1]).join(", ");
};

const availabilityLabel = (windows = []) => {
  if (!windows.length) return "Availability not set";
  const grouped = groupWeeklyWindows(windows);
  const first = grouped[0];
  const overnight = first.endMinute < first.startMinute ? " · next day" : "";
  const summary = `${dayRangeLabel(first.weekdays)} · ${clockLabel(first.startMinute)}–${clockLabel(first.endMinute)}${overnight}`;
  return grouped.length > 1 ? `${summary} · +${grouped.length - 1} window${grouped.length === 2 ? "" : "s"}` : summary;
};

export function taskListPage({ state, listItem, all, taskSessions, taskTotal, listTotal, listEstimateTotal, attentionTaskIds }) {
  const todo = all.filter((task) => !task.completedAt);
  const dailyTodo = todo.filter((task) => task.cadence === "daily");
  const oneTimeTodo = todo.filter((task) => task.cadence !== "daily");
  const done = all.filter((task) => task.completedAt).sort((a, b) => b.completedAt - a.completedAt);
  const rowContext = { state, listItem, taskSessions, taskTotal, attentionTaskIds };
  const trackedMs = listTotal(listItem.id);
  const estimateMin = listEstimateTotal(listItem.id);
  const progressPct = estimateMin ? Math.min(100, trackedMs / (estimateMin * 60_000) * 100) : 0;
  const lifeArea = LIFE_AREAS.find((area) => area.key === listItem.lifeArea);
  const areaName = lifeArea?.key === "career" ? "Career" : lifeArea?.label;
  const areaLabel = lifeArea ? `${listItem.lifeDirection === "decrease" ? "↓" : "↑"} ${areaName}` : "Unsorted";

  const albumOrder = [];
  const byAlbum = new Map();
  for (const task of oneTimeTodo) {
    const key = task.album || "";
    if (!byAlbum.has(key)) { byAlbum.set(key, []); albumOrder.push(key); }
    byAlbum.get(key).push(task);
  }
  const singles = byAlbum.get("") || [];
  const albums = albumOrder.filter(Boolean);

  const albumSections = albums.map((name) => {
    const tasks = byAlbum.get(name);
    const totalMs = tasks.reduce((sum, task) => sum + taskTotal(task.id), 0);
    const totalEstimate = tasks.reduce((sum, task) => sum + (task.estimateMin || 0), 0);
    const color = albumColor(name);
    return html`
      <div class="albhead" data-album-drop=${name} title="Drop a task here to add it to this album">
        <div class="alb-tile" style=${`background:${color}22;color:${color}`}>💿</div>
        <div class="alb-meta"><div class="alb-name">${name}</div><div class="alb-sub">${tasks.length} task${tasks.length === 1 ? "" : "s"} · ${withEstimate(fmtLong(totalMs), totalEstimate)}</div></div>
        <button class="alb-play" data-action="play" data-id=${tasks[0].id} data-stop-propagation="true" title="Play first task in this album">▶</button>
      </div>
      ${taskTable(tasks, rowContext)}`;
  });

  const singlesSection = albums.length
    ? html`<div class="singles-tag" data-album-drop="" title="Drop a task here to remove it from its album">Singles</div>
        ${singles.length ? taskTable(singles, rowContext) : html`<div class="empty-singles" data-album-drop="">Drop a task here to remove it from its album</div>`}`
    : singles.length ? taskTable(singles, rowContext) : null;

  return html`
    ${stickyHeader({ icon: listItem.emoji, name: listItem.name })}
    <div class="hdr list-hero" data-tauri-drag-region>
      <button class="list-edit-action" data-action="editList" data-id=${listItem.id} title="Edit list" aria-label="Edit list">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path>
        </svg>
      </button>
      <div class="cover list-cover" style=${`background:linear-gradient(135deg,${listItem.color},${listItem.color}55)`}>
        <span>${listItem.emoji}</span>
        <span class="cover-equalizer" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      </div>
      <div class="info list-hero-info">
        <small>Playlist</small>
        <h1>${listItem.name}</h1>
        <div class="sub">${todo.length} track${todo.length === 1 ? "" : "s"}${done.length ? ` · ${done.length} completed` : ""} · ${fmtLong(trackedMs)} recorded</div>
        <div class="list-liner">
          <span class="list-area" style=${lifeArea ? `color:${lifeArea.color}` : ""}>${areaLabel}</span>
          <span class="list-availability">${availabilityLabel(listItem.availabilityWindows || [])}</span>
          ${estimateMin ? html`<span class="list-progress-track" aria-label=${`${fmtLong(trackedMs)} of ${fmtEst(estimateMin)} recorded`}>
            <span style=${`width:${progressPct}%;background-color:${listItem.color}`}></span>
          </span>` : null}
          <span class="list-progress-time">${withEstimate(fmtLong(trackedMs), estimateMin)}</span>
        </div>
      </div>
    </div>
    <div class="list-action-row">
      <button class="pill list-add-task" data-action="addTask">＋ Add task</button>
    </div>
    ${todo.length ? html`
      <div class="task-kind-label">Daily <span>· ${dailyTodo.length}</span></div>
      ${dailyTodo.length ? taskTable(dailyTodo, rowContext, "albrows task-kind-rows") : html`<div class="task-kind-empty">No daily tasks in this list.</div>`}
      <div class="task-kind-label one-time">One-time <span>· ${oneTimeTodo.length}</span></div>
      ${oneTimeTodo.length ? html`${albumSections}${singlesSection}` : html`<div class="task-kind-empty">No one-time tasks in this list.</div>`}
    ` : html`<div class="empty">${all.length ? "All done here. 🎉" : html`No tasks yet. Click <b>Add task</b> to start.`}</div>`}
    ${done.length ? html`
      <div class="cgroup ${state.completedOpen ? "open" : ""}">
        <div class="chead" data-action="toggleCompleted"><span class="chev">›</span> Completed · ${done.length}</div>
        <div class="clist">${done.map((task) => html`
          <div class="crow" data-action="openDetail" data-id=${task.id}>
            <button class="ccheck" title="Mark as not done" data-action="toggleDone" data-id=${task.id} data-stop-propagation="true">✓</button>
            <span class="cname">${task.name}</span><span class="ctime">${fmtHM(taskTotal(task.id))}</span>
            <button class="menu-btn" title="More" data-action="openRowMenu" data-id=${task.id} data-stop-propagation="true">⋯</button>
          </div>`)}</div>
      </div>` : null}
    <p class="note">Only one task runs at a time. The menu-bar item shows live minutes and toggles play/pause.</p>`;
}
