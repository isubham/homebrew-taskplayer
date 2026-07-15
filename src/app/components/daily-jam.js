import { html } from "../../vendor/lit-html.js";
import { LIFE_AREAS } from "../utils.js";
import { taskRow, taskTableHead } from "./task-row.js";

const groups = (state, entries) => {
  const rankByArea = new Map((state.S.lifeAreaPriorities || []).map((item) => [item.areaKey, item.priorityRank]));
  const orderedAreas = LIFE_AREAS.map((area, canonicalIndex) => ({ area, canonicalIndex }))
    .sort((a, b) =>
      (rankByArea.get(a.area.key) ?? a.canonicalIndex + 1) - (rankByArea.get(b.area.key) ?? b.canonicalIndex + 1)
      || a.canonicalIndex - b.canonicalIndex);
  const knownAreas = new Set(LIFE_AREAS.map((area) => area.key));
  const result = orderedAreas.map(({ area }) => ({
    key: area.key,
    label: area.label,
    color: area.color,
    entries: entries.filter((entry) => entry.listItem?.lifeArea === area.key),
  }));
  const unsorted = entries.filter((entry) => !knownAreas.has(entry.listItem?.lifeArea));
  if (unsorted.length) result.push({ key: "unsorted", label: "Unsorted", color: "#777", entries: unsorted });
  return result;
};

const taskTable = (entries, startIndex, context, withHead = false) => html`
  <table class="albrows daily-jam-rows">
    ${withHead ? taskTableHead() : null}
    <tbody>${entries.map((entry, index) => taskRow({
      ...context,
      task: entry.task,
      listItem: entry.listItem,
      index: startIndex + index,
      context: "dailyJam",
    }))}</tbody>
  </table>`;

const folderIcon = () => html`
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  </svg>`;

const card = (group, context) => {
  const done = group.entries.filter((entry) => entry.doneToday).length;
  const total = group.entries.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const visible = group.entries.slice(0, 4);
  const remaining = group.entries.slice(4);
  return html`
    <article class="daily-jam-card" style=${`--daily-area:${group.color}`}>
      <header class="daily-jam-card-head">
        <span class="daily-jam-area-icon">${folderIcon()}</span><h5>${group.label}</h5>
        <span class="daily-jam-count">${total ? `${done} of ${total}` : "No tasks"}</span>
      </header>
      <div class="daily-jam-area-bar" aria-label="${done} of ${total} complete today"><span style=${`width:${percent}%`}></span></div>
      <div class="daily-jam-task-list">
        ${visible.length ? taskTable(visible, 0, context, true) : html`<div class="daily-jam-card-empty">No daily tasks here yet.</div>`}
        ${remaining.length ? html`
          <details class="daily-jam-more"><summary><span class="more-closed">Show ${remaining.length} more</span><span class="more-open">Show fewer</span></summary>
            ${taskTable(remaining, visible.length, context)}
          </details>` : null}
      </div>
    </article>`;
};

export const dailyJam = ({ state, entries, doneCount, percent, taskSessions, taskTotal, attentionTaskIds }) => html`
  <div class="daily-jam-bar" aria-label="${doneCount} of ${entries.length} complete today">
    <div class="daily-jam-bar-fill" style=${`width:${percent}%`}></div>
  </div>
  <div class="daily-jam-grid">${groups(state, entries).map((group) => card(group, { state, taskSessions, taskTotal, attentionTaskIds }))}</div>`;
