import type { Task, TaskList, WeeklyTimeWindow } from "../bindings";
import {
  PLANNER_DEFAULT_START_HOUR,
  PLANNER_HOURS_PER_DAY,
  PLANNER_MINUTES_PER_HOUR,
  PLANNER_MINUTES_PER_DAY,
  PLANNER_TIME_LABEL_FORMAT,
  PLANNER_TIME_STEP_MINUTES,
  SESSION_DEFAULT_DURATION_MINUTES,
  SESSION_MILLISECONDS_PER_MINUTE,
} from "../constants";
import { localDateValue, sessionDraftFromRange, type SessionDraft } from "../session-time";

export const startOfLocalDay = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export const addLocalDays = (timestamp: number, days: number): number => {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return startOfLocalDay(date.getTime());
};

const addLocalDaysPreservingTime = (timestamp: number, days: number): number => {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
};

export const isoWeekday = (timestamp: number): number => {
  const weekday = new Date(timestamp).getDay();
  return weekday === 0 ? 7 : weekday;
};

export const plannerTimestampAtMinute = (dayStart: number, minute: number): number => {
  const date = new Date(dayStart);
  date.setHours(
    Math.floor(minute / PLANNER_MINUTES_PER_HOUR),
    minute % PLANNER_MINUTES_PER_HOUR,
    0,
    0,
  );
  return date.getTime();
};

export function windowOccurrencesForDay(window: WeeklyTimeWindow, dayStart: number) {
  const dayEnd = addLocalDays(dayStart, 1);
  return [addLocalDays(dayStart, -1), dayStart].flatMap((occurrenceDay) => {
    if (isoWeekday(occurrenceDay) !== window.weekday) return [];
    const start = plannerTimestampAtMinute(occurrenceDay, window.startMinute);
    let end = plannerTimestampAtMinute(occurrenceDay, window.endMinute);
    if (window.endMinute < window.startMinute) end = addLocalDaysPreservingTime(end, 1);
    if (end <= start || start >= dayEnd || end <= dayStart) return [];
    return [{ start, end }];
  });
}

const roundUpToStep = (timestamp: number): number => {
  const step = PLANNER_TIME_STEP_MINUTES * SESSION_MILLISECONDS_PER_MINUTE;
  return Math.ceil(timestamp / step) * step;
};

export function createPlannerDraft(
  anchorDay: number,
  task?: Pick<Task, "minSessionMin" | "maxSessionMin"> | null,
  now = Date.now(),
): SessionDraft {
  const today = startOfLocalDay(now);
  const dayStart = startOfLocalDay(anchorDay);
  const defaultStart = new Date(dayStart);
  defaultStart.setHours(PLANNER_DEFAULT_START_HOUR, 0, 0, 0);
  const start = dayStart === today
    ? roundUpToStep(Math.max(now, defaultStart.getTime()))
    : defaultStart.getTime();
  const requested = task?.minSessionMin || SESSION_DEFAULT_DURATION_MINUTES;
  const duration = task?.maxSessionMin ? Math.min(requested, task.maxSessionMin) : requested;
  return sessionDraftFromRange(
    start,
    start + duration * SESSION_MILLISECONDS_PER_MINUTE,
  );
}

export function createRecordedSessionDraft(
  anchorDay: number,
  task?: Pick<Task, "minSessionMin" | "maxSessionMin"> | null,
  now = Date.now(),
): SessionDraft {
  const dayStart = startOfLocalDay(anchorDay);
  const today = startOfLocalDay(now);
  const requested = task?.minSessionMin || SESSION_DEFAULT_DURATION_MINUTES;
  const duration = task?.maxSessionMin ? Math.min(requested, task.maxSessionMin) : requested;
  const durationMs = duration * SESSION_MILLISECONDS_PER_MINUTE;
  if (dayStart < today) {
    const start = new Date(dayStart);
    start.setHours(PLANNER_DEFAULT_START_HOUR, 0, 0, 0);
    return sessionDraftFromRange(start.getTime(), start.getTime() + durationMs);
  }
  const end = new Date(now);
  end.setSeconds(0, 0);
  const endTimestamp = end.getTime();
  return sessionDraftFromRange(Math.max(dayStart, endTimestamp - durationMs), endTimestamp);
}

export const plannerTimeLabel = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString(undefined, PLANNER_TIME_LABEL_FORMAT);

export const plannerDateKey = (timestamp: number): string => localDateValue(timestamp);

export function listAvailabilityContainsRange(
  list: Pick<TaskList, "availabilityWindows">,
  range: { start: number; end: number },
): boolean {
  return (list.availabilityWindows || []).some((window) =>
    windowOccurrencesForDay(window, startOfLocalDay(range.start))
      .some((occurrence) => occurrence.start <= range.start && occurrence.end >= range.end));
}

export function plannerMinuteInDay(timestamp: number, dayStart: number, end = false): number {
  const dayEnd = addLocalDays(dayStart, 1);
  if (timestamp <= dayStart) return 0;
  if (timestamp >= dayEnd) return PLANNER_MINUTES_PER_DAY;
  const date = new Date(timestamp);
  const minute = date.getHours() * PLANNER_MINUTES_PER_HOUR + date.getMinutes();
  return end && minute === 0 ? PLANNER_HOURS_PER_DAY * PLANNER_MINUTES_PER_HOUR : minute;
}
