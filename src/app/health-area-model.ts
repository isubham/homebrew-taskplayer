import { GOAL_STATUS, HEALTH_AREA_KEY, HEALTH_AREA_LIMITS, HEALTH_UPCOMING_KINDS, MILLISECONDS_PER_DAY, TASK_CADENCE_DAILY } from "./constants";
import { dailyPayoutOn, isTaskTerminallyCompleted, repeatingTaskOccursOn } from "./utils";

const taskOrder = (left, right) => left.order - right.order || left.name.localeCompare(right.name);

const isSupportiveTask = (task, listItem) =>
  task.impactSign !== -1 && listItem?.lifeDirection !== "decrease";

export function buildHealthAreaModel(snapshot, now = Date.now()) {
  const lists = snapshot.lists
    .filter((listItem) => listItem.lifeArea === HEALTH_AREA_KEY)
    .sort((left, right) => left.order - right.order);
  const listById = new Map(lists.map((listItem) => [listItem.id, listItem]));
  const tasks = snapshot.tasks.filter((task) => listById.has(task.listId));
  const activeTaskId = snapshot.run.activeTaskId && snapshot.run.phase
    ? snapshot.run.activeTaskId
    : null;
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const upcomingEnd = now + MILLISECONDS_PER_DAY * HEALTH_AREA_LIMITS.upcomingDays;
  const futurePlanByTask = new Map();

  for (const plan of snapshot.plannedSessions || []) {
    if (plan.start == null || plan.start < now) continue;
    const current = futurePlanByTask.get(plan.taskId);
    if (!current || plan.start < current.start) futurePlanByTask.set(plan.taskId, plan);
  }

  const supportiveTasks = tasks.filter((task) => isSupportiveTask(task, listById.get(task.listId)));
  const supportiveTaskIds = new Set(supportiveTasks.map((task) => task.id));
  const nextActions = supportiveTasks
    .filter((task) => task.cadence !== TASK_CADENCE_DAILY && !isTaskTerminallyCompleted(task))
    .sort((left, right) =>
      Number(right.id === activeTaskId) - Number(left.id === activeTaskId)
      || (futurePlanByTask.get(left.id)?.start ?? Infinity) - (futurePlanByTask.get(right.id)?.start ?? Infinity)
      || (left.deadlineAt ?? Infinity) - (right.deadlineAt ?? Infinity)
      || taskOrder(left, right))
    .map((task) => ({ task, listItem: listById.get(task.listId) }));

  const routines = supportiveTasks
    .filter((task) => task.cadence === TASK_CADENCE_DAILY && repeatingTaskOccursOn(task, todayStart))
    .map((task) => ({
      task,
      listItem: listById.get(task.listId),
      doneToday: dailyPayoutOn(task, snapshot.sessions, todayStart),
    }))
    .sort((left, right) =>
      Number(left.doneToday) - Number(right.doneToday)
      || Number(right.task.id === activeTaskId) - Number(left.task.id === activeTaskId)
      || taskOrder(left.task, right.task));

  const upcoming = [];
  for (const plan of snapshot.plannedSessions || []) {
    const task = tasks.find((candidate) => candidate.id === plan.taskId);
    if (!task || !supportiveTaskIds.has(task.id) || plan.start == null || plan.start < now || plan.start >= upcomingEnd) continue;
    upcoming.push({ kind: HEALTH_UPCOMING_KINDS.planned, at: plan.start, task, listItem: listById.get(task.listId), plan });
  }
  for (const task of supportiveTasks) {
    if (task.cadence === TASK_CADENCE_DAILY || isTaskTerminallyCompleted(task)) continue;
    if (task.deadlineAt == null || task.deadlineAt < todayStart || task.deadlineAt >= upcomingEnd) continue;
    upcoming.push({ kind: HEALTH_UPCOMING_KINDS.deadline, at: task.deadlineAt, task, listItem: listById.get(task.listId) });
  }
  upcoming.sort((left, right) => left.at - right.at || taskOrder(left.task, right.task));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const linksByGoal = new Map();
  for (const link of snapshot.goalTaskLinks || []) {
    const task = taskById.get(link.taskId);
    if (!task) continue;
    const linked = linksByGoal.get(link.goalId) || [];
    linked.push(task);
    linksByGoal.set(link.goalId, linked);
  }
  const goals = (snapshot.goals || [])
    .filter((goal) => goal.lifeArea === HEALTH_AREA_KEY && goal.status !== GOAL_STATUS.archived)
    .map((goal) => {
      const linkedTasks = linksByGoal.get(goal.id) || [];
      const actions = linkedTasks.filter((task) => task.cadence !== TASK_CADENCE_DAILY);
      const routines = linkedTasks.filter((task) => task.cadence === TASK_CADENCE_DAILY);
      return {
        goal,
        linkedTasks,
        completedActions: actions.filter(isTaskTerminallyCompleted).length,
        actionCount: actions.length,
        routineCount: routines.length,
        nextTask: taskById.get(goal.nextTaskId) || null,
      };
    })
    .sort((left, right) =>
      Number(right.goal.isCurrentFocus) - Number(left.goal.isCurrentFocus)
      || right.goal.updatedAt - left.goal.updatedAt);

  return {
    lists,
    tasks,
    nextActions,
    routines,
    upcoming,
    goals,
    currentFocus: goals.find(({ goal }) => goal.isCurrentFocus && goal.status === GOAL_STATUS.active) || null,
  };
}
