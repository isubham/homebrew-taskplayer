import {
  SESSION_COPY,
  SESSION_DATE_PATTERN,
  SESSION_DEFAULT_DURATION_MINUTES,
  SESSION_MILLISECONDS_PER_MINUTE,
  SESSION_TIME_PATTERN,
} from "./constants";

export type SessionDraft = { date: string; start: string; end: string };

const pad = (value: number) => String(value).padStart(2, "0");

function dateParts(value?: string) {
  const match = value?.match(SESSION_DATE_PATTERN);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    ? { year, month, day }
    : null;
}

function timeParts(value?: string) {
  if (!value || !SESSION_TIME_PATTERN.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

export function localDateValue(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localTimeValue(timestamp: number) {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function createSessionDraft(timestamp = Date.now()): SessionDraft {
  const end = timestamp + (SESSION_DEFAULT_DURATION_MINUTES * SESSION_MILLISECONDS_PER_MINUTE);
  return {
    date: localDateValue(timestamp),
    start: localTimeValue(timestamp),
    end: localTimeValue(end),
  };
}

export function sessionDraftFromRange(start: number, end?: number | null): SessionDraft {
  return {
    date: localDateValue(start),
    start: localTimeValue(start),
    end: end ? localTimeValue(end) : "",
  };
}

export function sessionDraftError(draft?: Partial<SessionDraft> | null) {
  if (!dateParts(draft?.date)) {
    return SESSION_COPY.invalidDate;
  }
  if (!draft.start || !SESSION_TIME_PATTERN.test(draft.start)) {
    return SESSION_COPY.invalidStartTime;
  }
  if (!draft.end || !SESSION_TIME_PATTERN.test(draft.end)) {
    return SESSION_COPY.invalidEndTime;
  }
  if (draft.start === draft.end) return SESSION_COPY.equalTimes;
  return null;
}

export function parseSessionDraft(draft?: Partial<SessionDraft> | null) {
  if (sessionDraftError(draft)) return null;
  const date = dateParts(draft!.date)!;
  const startTime = timeParts(draft!.start)!;
  const endTime = timeParts(draft!.end)!;
  const startDate = new Date(
    date.year,
    date.month - 1,
    date.day,
    startTime.hour,
    startTime.minute,
  );
  const endDate = new Date(
    date.year,
    date.month - 1,
    date.day,
    endTime.hour,
    endTime.minute,
  );
  if (endDate < startDate) endDate.setDate(endDate.getDate() + 1);
  return { start: startDate.getTime(), end: endDate.getTime() };
}

export function sessionRangeLabel(start: number, end?: number | null) {
  const startDate = new Date(start);
  const dateLabel = startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const startLabel = localTimeValue(start);
  if (!end) return `${dateLabel} · ${startLabel}–${SESSION_COPY.liveEndLabel}`;
  const endDate = new Date(end);
  const endDateLabel = localDateValue(end) === localDateValue(start)
    ? ""
    : `${endDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} `;
  return `${dateLabel} · ${startLabel}–${endDateLabel}${localTimeValue(end)}`;
}
