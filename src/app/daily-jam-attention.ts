import {
  DAILY_JAM_COPY,
  DAILY_JAM_DUE_SOON_DAYS,
  DAILY_JAM_SCHEDULE_LEAD_MINUTES,
  DAILY_JAM_TASK_LIMIT,
  IMPACT_TIERS,
} from "./constants.jsx";
import { deadlineDate, repeatingTaskOccursOn } from "./utils.jsx";

const DAY_MS = 24 * 60 * 60 * 1000;

const todayWindows = (task, now) => {
  const weekday = new Date(now).getDay() || 7;
  return (task.dailyWindows || [])
    .filter((window) => Number(window.weekday) === weekday)
    .map((window) => Number(window.startMinute))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
};

const formatMinute = (minute) => new Date(2000, 0, 1, 0, minute)
  .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const attentionReason = (entry, now) => {
  if (entry.active) return DAILY_JAM_COPY.inProgress;
  if (entry.scheduledMinute != null) return DAILY_JAM_COPY.scheduledAt(formatMinute(entry.scheduledMinute));
  if (entry.task.deadlineAt) return deadlineDate(entry.task.deadlineAt, now);
  if (entry.scheduledToday) return DAILY_JAM_COPY.scheduledToday;
  const tier = IMPACT_TIERS[entry.task.impactTier];
  return tier ? DAILY_JAM_COPY.impact(tier.label) : DAILY_JAM_COPY.scheduledToday;
};

const attentionBand = (entry, now, nowMinute) => {
  if (entry.active) return 0;
  if (entry.scheduledMinute != null
    && entry.scheduledMinute <= nowMinute + DAILY_JAM_SCHEDULE_LEAD_MINUTES) return 1;
  if (entry.task.deadlineAt
    && entry.task.deadlineAt <= now + DAILY_JAM_DUE_SOON_DAYS * DAY_MS) return 2;
  if (entry.scheduledToday) return 3;
  return 4;
};

export const compareDailyJamAttention = (a, b) =>
  a.attentionBand - b.attentionBand
  || (IMPACT_TIERS[b.task.impactTier]?.weight ?? 0) - (IMPACT_TIERS[a.task.impactTier]?.weight ?? 0)
  || (a.task.deadlineAt ?? Infinity) - (b.task.deadlineAt ?? Infinity)
  || a.lastTouchedAt - b.lastTouchedAt;

export function visibleDailyJamAttentionCount(entries) {
  const visibleByArea = new Map();
  for (const entry of entries) {
    if (entry.doneToday && !entry.active) continue;
    const areaKey = entry.listItem?.lifeArea ?? "unsorted";
    const current = visibleByArea.get(areaKey) ?? 0;
    if (current < DAILY_JAM_TASK_LIMIT) visibleByArea.set(areaKey, current + 1);
  }
  return Array.from(visibleByArea.values()).reduce((total, count) => total + count, 0);
}

export function buildDailyJamAttentionEntries({ tasks, sessions, run, list, isAgainstTask, now = Date.now() }) {
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const nowDate = new Date(now);
  const nowMinute = nowDate.getHours() * 60 + nowDate.getMinutes();
  const activeTaskId = run.activeTaskId && run.phase ? run.activeTaskId : null;
  const liveTaskId = run.phase === "work" && run.runningStart ? activeTaskId : null;
  const lastTouch = new Map();

  for (const session of sessions) {
    const touchedAt = session.end ?? now;
    if (!lastTouch.has(session.taskId) || touchedAt > lastTouch.get(session.taskId)) {
      lastTouch.set(session.taskId, touchedAt);
    }
  }

  return tasks
    .filter((task) => !isAgainstTask(task))
    .filter((task) => !task.completedAt)
    .map((task) => {
      const working = task.id === liveTaskId;
      const active = task.id === activeTaskId;
      const scheduledToday = task.cadence === "daily" && repeatingTaskOccursOn(task, todayStart);
      const doneToday = scheduledToday && sessions.some((session) =>
        session.taskId === task.id && session.start >= todayStart && session.start < todayStart + DAY_MS);
      const windows = scheduledToday ? todayWindows(task, now) : [];
      const entry = {
        task,
        listItem: list(task.listId),
        active,
        working,
        doneToday: working || doneToday,
        scheduledToday,
        scheduledMinute: windows[0] ?? null,
        lastTouchedAt: lastTouch.get(task.id) ?? Number.NEGATIVE_INFINITY,
      };
      return {
        ...entry,
        attentionBand: attentionBand(entry, now, nowMinute),
        attentionReason: attentionReason(entry, now),
      };
    })
    .filter((entry) => entry.active || entry.scheduledToday || entry.task.deadlineAt || entry.task.impactTier)
    .sort(compareDailyJamAttention);
}
