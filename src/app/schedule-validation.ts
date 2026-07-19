import type { WeeklyTimeWindow } from "./bindings";
import {
  PLANNER_MINUTES_PER_DAY,
  SCHEDULE_VALIDATION_COPY,
  SCHEDULE_VALIDATION_MAX_ITEMS,
} from "./constants";
import { minuteToTime, WEEKDAYS } from "./weekly-schedule";

const WEEK_MINUTES = WEEKDAYS.length * PLANNER_MINUTES_PER_DAY;

export type ScheduleIssue = { blocking: boolean; message: string };
export type NamedWeeklySchedule = { id: string; name: string; windows?: WeeklyTimeWindow[] };

type AbsoluteRange = { start: number; end: number };

const absoluteRange = (window: WeeklyTimeWindow): AbsoluteRange => {
  const start = (window.weekday - 1) * PLANNER_MINUTES_PER_DAY + window.startMinute;
  const end = (window.weekday - 1) * PLANNER_MINUTES_PER_DAY + window.endMinute
    + (window.endMinute < window.startMinute ? PLANNER_MINUTES_PER_DAY : 0);
  return { start, end };
};

const overlap = (left: WeeklyTimeWindow, right: WeeklyTimeWindow): AbsoluteRange | null => {
  const a = absoluteRange(left);
  const b = absoluteRange(right);
  for (const offset of [-WEEK_MINUTES, 0, WEEK_MINUTES]) {
    const start = Math.max(a.start, b.start + offset);
    const end = Math.min(a.end, b.end + offset);
    if (start < end) return { start, end };
  }
  return null;
};

const normalizedMinute = (minute: number) => ((minute % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;

const rangeLabel = (range: AbsoluteRange): string => {
  const start = normalizedMinute(range.start);
  const duration = range.end - range.start;
  const end = start + duration;
  const startDay = Math.floor(start / PLANNER_MINUTES_PER_DAY);
  const endDay = Math.floor(end / PLANNER_MINUTES_PER_DAY);
  const startTime = minuteToTime(start % PLANNER_MINUTES_PER_DAY);
  const endTime = minuteToTime(end % PLANNER_MINUTES_PER_DAY);
  return endDay === startDay
    ? `${WEEKDAYS[startDay]} ${startTime}–${endTime}`
    : `${WEEKDAYS[startDay]} ${startTime}–${WEEKDAYS[endDay % WEEKDAYS.length]} ${endTime}`;
};

const firstOverlap = (left: WeeklyTimeWindow[], right: WeeklyTimeWindow[]) => {
  for (const leftWindow of left) {
    for (const rightWindow of right) {
      const match = overlap(leftWindow, rightWindow);
      if (match) return match;
    }
  }
  return null;
};

const selfIssue = (windows: WeeklyTimeWindow[]): ScheduleIssue | null => {
  const equal = windows.find((window) => window.startMinute === window.endMinute);
  if (equal) {
    return {
      blocking: true,
      message: SCHEDULE_VALIDATION_COPY.equalTimes(
        WEEKDAYS[equal.weekday - 1],
        minuteToTime(equal.startMinute),
      ),
    };
  }
  for (let left = 0; left < windows.length; left += 1) {
    for (let right = left + 1; right < windows.length; right += 1) {
      const match = overlap(windows[left], windows[right]);
      if (match) return { blocking: true, message: SCHEDULE_VALIDATION_COPY.selfOverlap(rangeLabel(match)) };
    }
  }
  return null;
};

const inspect = (
  windows: WeeklyTimeWindow[],
  schedules: NamedWeeklySchedule[],
  blocking: boolean,
  messageFor: (name: string, range: string) => string,
): ScheduleIssue[] => {
  const issues = schedules.flatMap((schedule) => {
    const match = firstOverlap(windows, schedule.windows || []);
    return match ? [{ blocking, message: messageFor(schedule.name, rangeLabel(match)) }] : [];
  });
  const visible = issues.slice(0, SCHEDULE_VALIDATION_MAX_ITEMS);
  const remaining = issues.length - visible.length;
  return remaining > 0
    ? [...visible, { blocking, message: SCHEDULE_VALIDATION_COPY.additionalItems(remaining) }]
    : visible;
};

export function inspectListAvailability(
  windows: WeeklyTimeWindow[],
  lists: NamedWeeklySchedule[],
  currentId?: string | null,
): ScheduleIssue[] {
  const own = selfIssue(windows);
  const others = inspect(
    windows,
    lists.filter((list) => list.id !== currentId),
    false,
    SCHEDULE_VALIDATION_COPY.listOverlap,
  );
  return own ? [own, ...others] : others;
}

export function validateTaskSchedule(
  windows: WeeklyTimeWindow[],
  tasks: NamedWeeklySchedule[],
  currentId?: string | null,
): ScheduleIssue[] {
  const own = selfIssue(windows);
  const others = inspect(
    windows,
    tasks.filter((task) => task.id !== currentId),
    true,
    SCHEDULE_VALIDATION_COPY.taskOverlap,
  );
  return own ? [own, ...others] : others;
}
