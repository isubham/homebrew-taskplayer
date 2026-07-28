import {
  ADAPTIVE_AREA_LIMITS,
  HEALTH_UPCOMING_KINDS,
  MILLISECONDS_PER_DAY,
  TASK_CADENCE_DAILY,
} from "./constants";
import { dailyPayoutOn, isTaskTerminallyCompleted, repeatingTaskOccursOn } from "./utils";

const taskOrder = (left, right) => left.order - right.order || left.name.localeCompare(right.name);
const promotable = (task, listItem) => task.impactSign !== -1 && listItem?.lifeDirection !== "decrease";

export function buildAdaptiveAreaModel(snapshot, areaKey, now = Date.now()) {
  const lists = snapshot.lists
    .filter((listItem) => listItem.lifeArea === areaKey)
    .sort((left, right) => left.order - right.order);
  const listById = new Map(lists.map((listItem) => [listItem.id, listItem]));
  const tasks = snapshot.tasks.filter((task) => listById.has(task.listId));
  const visibleTasks = tasks.filter((task) => promotable(task, listById.get(task.listId)));
  const visibleTaskIds = new Set(visibleTasks.map((task) => task.id));
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const upcomingEnd = now + (MILLISECONDS_PER_DAY * ADAPTIVE_AREA_LIMITS.upcomingDays);
  const futurePlanByTask = new Map();

  for (const plan of snapshot.plannedSessions || []) {
    if (plan.start == null || plan.start < now || !visibleTaskIds.has(plan.taskId)) continue;
    const current = futurePlanByTask.get(plan.taskId);
    if (!current || plan.start < current.start) futurePlanByTask.set(plan.taskId, plan);
  }

  const nextActions = visibleTasks
    .filter((task) => task.cadence !== TASK_CADENCE_DAILY && !isTaskTerminallyCompleted(task))
    .sort((left, right) =>
      Number(right.id === snapshot.run.activeTaskId) - Number(left.id === snapshot.run.activeTaskId)
      || (futurePlanByTask.get(left.id)?.start ?? Infinity) - (futurePlanByTask.get(right.id)?.start ?? Infinity)
      || (left.deadlineAt ?? Infinity) - (right.deadlineAt ?? Infinity)
      || taskOrder(left, right))
    .map((task) => ({ task, listItem: listById.get(task.listId) }));

  const routines = visibleTasks
    .filter((task) => task.cadence === TASK_CADENCE_DAILY && repeatingTaskOccursOn(task, todayStart))
    .map((task) => ({
      task,
      listItem: listById.get(task.listId),
      doneToday: dailyPayoutOn(task, snapshot.sessions, todayStart),
    }))
    .sort((left, right) => Number(left.doneToday) - Number(right.doneToday) || taskOrder(left.task, right.task));

  const upcoming = [];
  for (const [taskId, plan] of futurePlanByTask) {
    if (plan.start >= upcomingEnd) continue;
    const task = visibleTasks.find((candidate) => candidate.id === taskId);
    upcoming.push({ kind: HEALTH_UPCOMING_KINDS.planned, at: plan.start, task, listItem: listById.get(task.listId) });
  }
  for (const task of visibleTasks) {
    if (task.cadence === TASK_CADENCE_DAILY || isTaskTerminallyCompleted(task)) continue;
    if (task.deadlineAt == null || task.deadlineAt < todayStart || task.deadlineAt >= upcomingEnd) continue;
    upcoming.push({ kind: HEALTH_UPCOMING_KINDS.deadline, at: task.deadlineAt, task, listItem: listById.get(task.listId) });
  }
  upcoming.sort((left, right) => left.at - right.at || taskOrder(left.task, right.task));

  const activeTask = snapshot.run.activeTaskId && snapshot.run.phase
    ? visibleTasks.find((task) => task.id === snapshot.run.activeTaskId)
    : null;
  const plannedTask = nextActions.find(({ task }) => futurePlanByTask.has(task.id))?.task;
  const currentTask = activeTask || plannedTask || null;

  return {
    lists,
    tasks,
    nextActions,
    routines,
    upcoming,
    currentEntry: currentTask ? { task: currentTask, listItem: listById.get(currentTask.listId) } : null,
  };
}
