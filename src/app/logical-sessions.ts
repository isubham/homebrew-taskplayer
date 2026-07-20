import type { Session, Snapshot } from "./bindings";
import { LOGICAL_SESSION_STATUS, SESSION_INTERVAL_KIND, TIMER_PHASE } from "./constants";

export type SessionInterval = {
  id: string | null;
  start: number;
  end: number;
  kind: typeof SESSION_INTERVAL_KIND[keyof typeof SESSION_INTERVAL_KIND];
  live?: boolean;
};

export type LogicalSession = {
  id: string;
  taskId: string;
  start: number;
  end: number;
  finishedAt: number | null;
  focusMs: number;
  breakMs: number;
  status: typeof LOGICAL_SESSION_STATUS[keyof typeof LOGICAL_SESSION_STATUS];
  focusIntervals: SessionInterval[];
  breakIntervals: SessionInterval[];
  legacy: boolean;
};

type MutableLogicalSession = {
  id: string;
  taskId: string;
  rows: Session[];
  finishedAt: number | null;
  legacy: boolean;
};

const validRange = (start?: number | null, end?: number | null) =>
  start != null && end != null && end > start;

export function buildLogicalSessions(snapshot: Snapshot, now = Date.now()): LogicalSession[] {
  const groups = new Map<string, MutableLogicalSession>();
  for (const row of snapshot.sessions) {
    if (row.start == null) continue;
    const id = row.logicalSessionId || row.id;
    const group = groups.get(id) || {
      id,
      taskId: row.taskId,
      rows: [],
      finishedAt: null,
      legacy: !row.logicalSessionId,
    };
    group.rows.push(row);
    if (row.sessionFinishedAt != null) {
      group.finishedAt = Math.max(group.finishedAt || 0, row.sessionFinishedAt);
    }
    groups.set(id, group);
  }

  const run = snapshot.run;
  const activeId = run.activeSessionId || null;
  if (activeId) {
    const taskId = run.activeTaskId || run.lastTaskId;
    if (taskId && !groups.has(activeId)) {
      groups.set(activeId, { id: activeId, taskId, rows: [], finishedAt: null, legacy: false });
    }
  }

  return Array.from(groups.values()).flatMap((group) => {
    const active = activeId === group.id;
    const focusIntervals: SessionInterval[] = group.rows
      .filter((row) => validRange(row.start, row.end))
      .map((row) => ({
        id: row.id,
        start: row.start,
        end: row.end as number,
        kind: SESSION_INTERVAL_KIND.focus,
      }));
    if (active && run.phase === TIMER_PHASE.work && run.runningStart != null) {
      focusIntervals.push({
        id: null,
        start: run.runningStart,
        end: now,
        kind: SESSION_INTERVAL_KIND.focus,
        live: true,
      });
    }
    focusIntervals.sort((left, right) => left.start - right.start || left.end - right.end);
    if (!focusIntervals.length) return [];

    const start = focusIntervals[0].start;
    const lastFocusEnd = focusIntervals.reduce((latest, interval) => Math.max(latest, interval.end), start);
    const finishedAt = active ? null : Math.max(group.finishedAt || 0, lastFocusEnd);
    const end = active ? now : finishedAt;
    const breakIntervals: SessionInterval[] = [];
    let cursor = start;
    for (const interval of focusIntervals) {
      if (interval.start > cursor) {
        breakIntervals.push({
          id: null,
          start: cursor,
          end: interval.start,
          kind: SESSION_INTERVAL_KIND.break,
        });
      }
      cursor = Math.max(cursor, interval.end);
    }
    if (end > cursor) {
      breakIntervals.push({ id: null, start: cursor, end, kind: SESSION_INTERVAL_KIND.break });
    }

    const focusMs = focusIntervals.reduce((total, interval) => total + interval.end - interval.start, 0);
    const breakMs = breakIntervals.reduce((total, interval) => total + interval.end - interval.start, 0);
    const status = active
      ? run.phase === TIMER_PHASE.work
        ? LOGICAL_SESSION_STATUS.focus
        : run.phase === TIMER_PHASE.break
          ? LOGICAL_SESSION_STATUS.break
          : LOGICAL_SESSION_STATUS.paused
      : LOGICAL_SESSION_STATUS.finished;
    return [{
      id: group.id,
      taskId: group.taskId,
      start,
      end,
      finishedAt,
      focusMs,
      breakMs,
      status,
      focusIntervals,
      breakIntervals,
      legacy: group.legacy,
    }];
  }).sort((left, right) => right.start - left.start);
}
