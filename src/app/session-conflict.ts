import type { Snapshot } from "./bindings";
import { SESSION_COPY } from "./constants";
import { sessionRangeLabel } from "./session-time";

export type SessionRange = { start: number; end: number };

export type SessionConflict = SessionRange & {
  taskId: string;
};

const overlaps = (left: SessionRange, right: SessionRange) =>
  left.start < right.end && left.end > right.start;

export function findSessionConflict(
  snapshot: Snapshot,
  range: SessionRange,
  excludedSessionId?: string | null,
  now = Date.now(),
): SessionConflict | null {
  const conflicts = snapshot.sessions.flatMap((session) => {
    if (session.id === excludedSessionId || session.start == null) return [];
    const candidate = { taskId: session.taskId, start: session.start, end: session.end ?? now };
    return overlaps(range, candidate) ? [candidate] : [];
  });
  const run = snapshot.run;
  if (run.phase === "work" && run.activeTaskId && run.runningStart != null) {
    const active = { taskId: run.activeTaskId, start: run.runningStart, end: now };
    if (overlaps(range, active)) conflicts.push(active);
  }
  return conflicts.sort((left, right) => left.start - right.start)[0] || null;
}

export function sessionConflictError(
  snapshot: Snapshot,
  range: SessionRange,
  excludedSessionId?: string | null,
) {
  const conflict = findSessionConflict(snapshot, range, excludedSessionId);
  if (!conflict) return null;
  const taskName = snapshot.tasks.find((task) => task.id === conflict.taskId)?.name
    || SESSION_COPY.unknownTask;
  return SESSION_COPY.overlapError(taskName, sessionRangeLabel(conflict.start, conflict.end));
}
