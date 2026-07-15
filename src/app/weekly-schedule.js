export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const minuteToTime = (minutes) => {
  const value = Number.isFinite(Number(minutes)) ? Number(minutes) : 9 * 60;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};

export const timeToMinute = (value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

export const isOvernightWindow = (startMinute, endMinute) =>
  startMinute !== null && endMinute !== null && endMinute < startMinute;

export function updateOvernightIndicator(row) {
  if (!row) return;
  const startMinute = timeToMinute(row.querySelector("[data-window-start]")?.value);
  const endMinute = timeToMinute(row.querySelector("[data-window-end]")?.value);
  const indicator = row.querySelector("[data-overnight-indicator]");
  if (indicator) indicator.hidden = !isOvernightWindow(startMinute, endMinute);
}

export function groupWeeklyWindows(windows = []) {
  if (!windows.length) return [{ weekdays: [], startMinute: 9 * 60, endMinute: 17 * 60 }];
  const grouped = new Map();
  windows.forEach((window) => {
    const key = `${window.startMinute}-${window.endMinute}`;
    const group = grouped.get(key) || { weekdays: [], startMinute: window.startMinute, endMinute: window.endMinute };
    group.weekdays.push(Number(window.weekday));
    grouped.set(key, group);
  });
  return [...grouped.values()];
}

const actionAttrs = (action, taskId) => action
  ? `data-action="${action}" data-id="${taskId}"`
  : "";

export const simpleScheduleRowHtml = (availability = {}, options = {}) => `
  <div class="simple-availability-row" data-window-row>
    <div class="weekday-pill-row" aria-label="Available days">
      ${WEEKDAYS.map((day, index) => `<label class="weekday-pill"><input type="checkbox" data-weekday="${index + 1}" ${(availability.weekdays || []).includes(index + 1) ? "checked" : ""} ${actionAttrs(options.changeAction, options.taskId)}><span>${day.slice(0, 3)}</span></label>`).join("")}
    </div>
    <div class="availability-time-row">
      <input type="time" aria-label="Available from" data-window-start value="${minuteToTime(availability.startMinute)}" ${actionAttrs(options.changeAction, options.taskId)}>
      <span>to</span>
      <div class="availability-end-field">
        <input type="time" aria-label="Available until" data-window-end value="${minuteToTime(availability.endMinute ?? 17 * 60)}" ${actionAttrs(options.changeAction, options.taskId)}>
        <span class="overnight-indicator" data-overnight-indicator ${isOvernightWindow(availability.startMinute, availability.endMinute) ? "" : "hidden"}>Next day</span>
      </div>
      <button type="button" class="weekly-window-remove" data-window-remove aria-label="Remove time window" ${actionAttrs(options.removeAction, options.taskId)} data-stop-propagation="true">×</button>
    </div>
  </div>`;

export const simpleScheduleEditorHtml = (id, windows = [], options = {}) => `
  <div class="weekly-editor simple-availability" id="${id}" data-day-mode="simple">
    <div class="simple-availability-list" data-window-list>${groupWeeklyWindows(windows).map((availability) => simpleScheduleRowHtml(availability, options)).join("")}</div>
    <button type="button" class="linkbtn blue weekly-window-add" data-window-add ${actionAttrs(options.addAction, options.taskId)} data-stop-propagation="true">＋ Add another time</button>
  </div>`;
