import {
  SESSION_DEFAULT_DURATION_MINUTES,
  SESSION_MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_DAY,
  TASK_CADENCE_DAILY,
} from "./constants";
import { sessionDraftFromRange } from "./session-time";

const rangeForWindow = (dayStart, window) => {
  const startMinute = Number(window.startMinute);
  const endMinute = Number(window.endMinute);
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || startMinute === endMinute) return null;
  const start = dayStart + (startMinute * SESSION_MILLISECONDS_PER_MINUTE);
  let end = dayStart + (endMinute * SESSION_MILLISECONDS_PER_MINUTE);
  if (end <= start) end += MILLISECONDS_PER_DAY;
  return { start, end };
};

export function routineSessionRange(task, now = Date.now()) {
  if (task?.cadence !== TASK_CADENCE_DAILY) return null;
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const dayStart = day.getTime();
  const weekday = day.getDay() || 7;
  const ranges = (task.dailyWindows || [])
    .filter((window) => Number(window.weekday) === weekday)
    .map((window) => rangeForWindow(dayStart, window))
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);
  if (!ranges.length) {
    return {
      start: now - (SESSION_DEFAULT_DURATION_MINUTES * SESSION_MILLISECONDS_PER_MINUTE),
      end: now,
    };
  }
  return ranges.find((range) => range.start <= now && range.end >= now)
    || [...ranges].reverse().find((range) => range.end <= now)
    || ranges[0];
}

export function routineSessionDraft(task, now = Date.now()) {
  const range = routineSessionRange(task, now);
  return range ? sessionDraftFromRange(range.start, range.end) : null;
}
