import { html } from "../../vendor/lit-html.js";
import { playingEqualizer } from "./playing-equalizer.js";

const gripIcon = () => html`
  <svg viewBox="0 0 10 16" width="8" height="14" fill="currentColor" aria-hidden="true">
    <circle cx="2" cy="2" r="1.3"></circle><circle cx="8" cy="2" r="1.3"></circle>
    <circle cx="2" cy="8" r="1.3"></circle><circle cx="8" cy="8" r="1.3"></circle>
    <circle cx="2" cy="14" r="1.3"></circle><circle cx="8" cy="14" r="1.3"></circle>
  </svg>`;

const folderIcon = () => html`
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  </svg>`;

export const sidebarToggleIcon = ({ anyCollapsed }) => html`
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${anyCollapsed
      ? html`<path d="m7 7 5 5 5-5"></path><path d="m7 13 5 5 5-5"></path>`
      : html`<path d="m7 11 5-5 5 5"></path><path d="m7 17 5-5 5 5"></path>`}
  </svg>`;

export const sidebarListRow = ({ listItem, detail, active, playing, attention }) => html`
  <div class="list-item sidebar-track${active ? " active" : ""}${playing ? " playing-list" : ""}"
      draggable="true" data-drag-list-id=${listItem.id} data-action="selectList" data-id=${listItem.id} title=${detail}>
    <span class="list-grip" title="Drag to reorder">${gripIcon()}</span>
    <span class="li-icon">${listItem.emoji}</span>
    <span class="li-label">${listItem.name}</span>
    ${playing ? playingEqualizer({ className: "sidebar-equalizer" }) : null}
    ${attention ? html`<span class="sidebar-attention-dot" title="Contains a task with a deadline cue" aria-label="Contains a task with a deadline cue"></span>` : null}
  </div>`;

export const sidebar = ({ sections, collapsed, rowForList }) => html`
  ${sections.map((section) => {
    const isCollapsed = Boolean(collapsed[section.key]);
    const count = section.items.length;
    return html`
      <div class="list-section${isCollapsed ? " collapsed" : ""}">
        <div class="ls-header" data-action="toggleAreaSection" data-area=${section.key} data-area-drop=${section.dropArea}
            data-priority-area=${section.priorityRank ? section.key : null}
            title="${section.label} — ${count} list${count === 1 ? "" : "s"}">
          ${section.priorityRank ? html`<span class="ls-priority-grip" draggable="true" data-drag-area=${section.key} title="Drag to change planning priority">${gripIcon()}</span>` : null}
          <span class="ls-folder" style=${`color:${section.color}`}>${folderIcon()}</span>
          <span class="ls-label">${section.label}</span>
          <span class="ls-chevron">›</span>
        </div>
        <div class="ls-body">
          ${count
            ? section.items.map(rowForList)
            : html`<button type="button" class="ls-invite" data-action="addListInArea" data-area=${section.dropArea} title="Create the first list in ${section.label}">+ Start a list</button>`}
        </div>
      </div>`;
  })}`;
