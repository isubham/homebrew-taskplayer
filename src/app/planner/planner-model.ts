import type { Snapshot, Task, TaskList } from "../bindings";
import {
  PLANNER_BLOCK_KINDS,
  PLANNER_BLOCK_ID_PREFIXES,
  PLANNER_ACTIVE_COLOR,
  PLANNER_ACTUAL_CONTEXT_DAYS,
  PLANNER_DATE_HEADING_FORMAT,
  PLANNER_DATE_SHORT_FORMAT,
  PLANNER_FALLBACK_COLOR,
  PLANNER_COPY,
  TASK_CADENCE_DAILY,
} from "../constants";
import {
  addLocalDays,
  plannerDateKey,
  startOfLocalDay,
  windowOccurrencesForDay,
} from "./planner-time";

export type PlannerBlockKind = typeof PLANNER_BLOCK_KINDS[keyof typeof PLANNER_BLOCK_KINDS];

export type PlannerBlock = {
  id: string;
  listId?: string;
  taskId?: string;
  label: string;
  detail: string;
  color: string;
  start: number;
  end: number;
  kind: PlannerBlockKind;
};

export type PlannerDeadline = { taskId: string; label: string; color: string };

export type PlannerDay = {
  start: number;
  end: number;
  heading: string;
  shortHeading: string;
  isToday: boolean;
  blocks: PlannerBlock[];
  deadlines: PlannerDeadline[];
};

const listForTask = (task: Task | undefined, lists: Map<string, TaskList>) =>
  task ? lists.get(task.listId) : undefined;

export function buildPlannerDays(
  snapshot: Snapshot,
  anchorTimestamp: number,
  dayCount: number,
  now = Date.now(),
): PlannerDay[] {
  const anchor = startOfLocalDay(anchorTimestamp);
  const today = startOfLocalDay(now);
  const actualContextStart = addLocalDays(today, -PLANNER_ACTUAL_CONTEXT_DAYS);
  const tasks = new Map(snapshot.tasks.map((task) => [task.id, task]));
  const lists = new Map(snapshot.lists.map((list) => [list.id, list]));
  const days = Array.from({ length: dayCount }, (_, index) => {
    const start = addLocalDays(anchor, index);
    return {
      start,
      end: addLocalDays(start, 1),
      heading: new Date(start).toLocaleDateString(undefined, PLANNER_DATE_HEADING_FORMAT),
      shortHeading: new Date(start).toLocaleDateString(undefined, PLANNER_DATE_SHORT_FORMAT),
      isToday: start === today,
      blocks: [],
      deadlines: [],
    } satisfies PlannerDay;
  });

  for (const day of days) {
    for (const list of snapshot.lists) {
      for (const window of list.availabilityWindows || []) {
        for (const range of windowOccurrencesForDay(window, day.start)) {
          day.blocks.push({
            id: `${PLANNER_BLOCK_ID_PREFIXES.availability}:${list.id}:${range.start}`,
            listId: list.id,
            label: PLANNER_COPY.availabilityBlockLabel(list.name),
            detail: list.name,
            color: list.color,
            start: range.start,
            end: range.end,
            kind: PLANNER_BLOCK_KINDS.availability,
          });
        }
      }
    }

    for (const task of snapshot.tasks.filter((item) => item.cadence === TASK_CADENCE_DAILY)) {
      const list = listForTask(task, lists);
      for (const window of task.dailyWindows || []) {
        for (const range of windowOccurrencesForDay(window, day.start)) {
          day.blocks.push({
            id: `${PLANNER_BLOCK_ID_PREFIXES.routine}:${task.id}:${range.start}`,
            listId: task.listId,
            taskId: task.id,
            label: task.name,
            detail: list?.name || "",
            color: list?.color || PLANNER_FALLBACK_COLOR,
            start: range.start,
            end: range.end,
            kind: PLANNER_BLOCK_KINDS.routine,
          });
        }
      }
    }

    for (const task of snapshot.tasks) {
      if (!task.deadlineAt || task.completedAt || plannerDateKey(task.deadlineAt) !== plannerDateKey(day.start)) continue;
      const list = listForTask(task, lists);
      day.deadlines.push({ taskId: task.id, label: task.name, color: list?.color || PLANNER_FALLBACK_COLOR });
    }
  }

  const addTimedBlock = (block: PlannerBlock) => {
    days.filter((day) => block.start < day.end && block.end > day.start)
      .forEach((day) => day.blocks.push(block));
  };

  for (const planned of snapshot.plannedSessions || []) {
    const task = tasks.get(planned.taskId);
    if (!task || task.completedAt || task.cadence || planned.start == null || planned.end == null || planned.end <= now) continue;
    const list = listForTask(task, lists);
    addTimedBlock({
      id: planned.id,
      listId: task.listId,
      taskId: task.id,
      label: task.name,
      detail: list?.name || "",
      color: list?.color || PLANNER_ACTIVE_COLOR,
      start: planned.start,
      end: planned.end,
      kind: PLANNER_BLOCK_KINDS.planned,
    });
  }

  for (const session of snapshot.sessions) {
    if (session.start == null || (session.end || now) < actualContextStart) continue;
    const task = tasks.get(session.taskId);
    const list = listForTask(task, lists);
    addTimedBlock({
      id: session.id,
      listId: task?.listId,
      taskId: task?.id,
      label: task?.name || PLANNER_COPY.recordedWorkLabel,
      detail: list?.name || "",
      color: list?.color || PLANNER_FALLBACK_COLOR,
      start: session.start,
      end: session.end || now,
      kind: PLANNER_BLOCK_KINDS.actual,
    });
  }

  const run = snapshot.run;
  if (run.phase === "work" && run.activeTaskId && run.runningStart) {
    const task = tasks.get(run.activeTaskId);
    const list = listForTask(task, lists);
    addTimedBlock({
      id: `${PLANNER_BLOCK_ID_PREFIXES.live}:${run.activeTaskId}:${run.runningStart}`,
      listId: task?.listId,
      taskId: task?.id,
      label: task?.name || PLANNER_COPY.currentWorkLabel,
      detail: list?.name || "",
      color: list?.color || PLANNER_ACTIVE_COLOR,
      start: run.runningStart,
      end: now,
      kind: PLANNER_BLOCK_KINDS.live,
    });
  }

  const order = Object.values(PLANNER_BLOCK_KINDS);
  days.forEach((day) => day.blocks.sort((left, right) =>
    order.indexOf(left.kind) - order.indexOf(right.kind) || left.start - right.start
  ));
  return days;
}
