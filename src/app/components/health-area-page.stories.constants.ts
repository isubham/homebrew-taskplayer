import { GOAL_STATUS, HEALTH_AREA_KEY } from "../constants";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const todayWeekday = new Date().getDay() || 7;
const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
const recentRoutineEnd = Math.max(1, nowMinutes - 5);
const recentRoutineStart = Math.max(0, recentRoutineEnd - 20);

export const HEALTH_STORY_LISTS = [
  { id: "sleep", name: "Sleep", emoji: "🌙", color: "#2f9e8f", order: 0, lifeArea: "health", lifeDirection: "increase" },
  { id: "movement", name: "Movement", emoji: "🏃", color: "#2f9e8f", order: 1, lifeArea: "health", lifeDirection: "increase" },
];

export const HEALTH_STORY_TASKS = [
  {
    id: "curtains", listId: "sleep", name: "Buy blackout curtains", order: 0,
    cadence: null, completedAt: null, estimateMin: 25, impactTier: "medium", impactSign: 1,
    deadlineAt: Date.now() + (2 * DAY_MS),
  },
  {
    id: "checkup", listId: "movement", name: "Book annual health check", order: 1,
    cadence: null, completedAt: null, estimateMin: 10, impactTier: "high", impactSign: 1,
    deadlineAt: Date.now() + (5 * DAY_MS),
  },
  {
    id: "prepare-bedroom", listId: "sleep", name: "Prepare bedroom for tonight", order: 2,
    cadence: null, completedAt: null, estimateMin: 15, impactTier: "low", impactSign: 1,
    deadlineAt: null,
  },
  {
    id: "evening-walk", listId: "movement", name: "Evening walk", order: 3,
    cadence: "daily", completedAt: null, estimateMin: null, impactTier: "medium", impactSign: 1,
    deadlineAt: null, dailyWindows: [{ weekday: todayWeekday, startMinute: 1110, endMinute: 1130 }],
  },
  {
    id: "wind-down", listId: "sleep", name: "Wind-down routine", order: 4,
    cadence: "daily", completedAt: null, estimateMin: null, impactTier: "medium", impactSign: 1,
    deadlineAt: null, dailyWindows: [{ weekday: todayWeekday, startMinute: recentRoutineStart, endMinute: recentRoutineEnd }],
  },
];

export const HEALTH_STORY_SESSIONS = [
  {
    id: "walk-session",
    taskId: "evening-walk",
    start: new Date().setHours(7, 30, 0, 0),
    end: new Date().setHours(7, 50, 0, 0),
  },
];

export const HEALTH_STORY_SNAPSHOT = {
  lists: HEALTH_STORY_LISTS,
  albums: [],
  lifeAreaPriorities: [],
  tasks: HEALTH_STORY_TASKS,
  sessions: HEALTH_STORY_SESSIONS,
  plannedSessions: [{
    id: "checkup-plan",
    taskId: "checkup",
    start: Date.now() + DAY_MS,
    end: Date.now() + DAY_MS + (30 * MINUTE_MS),
  }],
  goals: [{
    id: "sleep-better",
    lifeArea: HEALTH_AREA_KEY,
    title: "Wake up rested most mornings",
    description: "Make evenings calmer and the bedroom easier to sleep in.",
    status: GOAL_STATUS.active,
    isCurrentFocus: true,
    nextTaskId: "curtains",
    updatedAt: Date.now(),
  }],
  goalTaskLinks: [
    { goalId: "sleep-better", taskId: "curtains", updatedAt: Date.now() },
    { goalId: "sleep-better", taskId: "wind-down", updatedAt: Date.now() },
  ],
  run: {
    activeTaskId: null,
    activeSessionId: null,
    lastTaskId: "curtains",
    phase: null,
    runningStart: null,
    deviceId: "health-story-device",
  },
  deviceId: "health-story-device",
};

export const HEALTH_STORY_EMPTY_SNAPSHOT = {
  ...HEALTH_STORY_SNAPSHOT,
  lists: [],
  tasks: [],
  sessions: [],
  plannedSessions: [],
  goals: [],
  goalTaskLinks: [],
};

export const healthStoryTaskSessions = (taskId) =>
  HEALTH_STORY_SESSIONS.filter((session) => session.taskId === taskId);

export const healthStoryTaskTotal = (taskId) =>
  healthStoryTaskSessions(taskId).reduce((total, session) => total + session.end - session.start, 0);

export const healthStoryLogicalSessions = () => HEALTH_STORY_SESSIONS.map((session) => ({
  id: session.id,
  taskId: session.taskId,
  finishedAt: session.end,
  focusMs: session.end - session.start,
  breakMs: 0,
  focusIntervals: [{ start: session.start, end: session.end }],
}));
