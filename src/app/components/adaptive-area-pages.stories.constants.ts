import { RELATIONSHIPS_AREA_KEY, WORK_AREA_KEY } from "../constants";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const now = Date.now();
const weekday = new Date(now).getDay() || 7;
const currentMinute = new Date(now).getHours() * 60 + new Date(now).getMinutes();
const routineEnd = Math.max(1, currentMinute - 5);
const routineStart = Math.max(0, routineEnd - 20);
const idleRun = {
  activeTaskId: null,
  activeSessionId: null,
  lastTaskId: null,
  phase: null,
  runningStart: null,
  deviceId: "adaptive-area-story-device",
};

export const RELATIONSHIPS_STORY_SNAPSHOT = {
  lists: [
    { id: "partner", name: "Partner", emoji: "💛", order: 0, lifeArea: RELATIONSHIPS_AREA_KEY, lifeDirection: "increase" },
    { id: "family", name: "Family", emoji: "🏡", order: 1, lifeArea: RELATIONSHIPS_AREA_KEY, lifeDirection: "increase" },
    { id: "friends", name: "Friends", emoji: "🫶", order: 2, lifeArea: RELATIONSHIPS_AREA_KEY, lifeDirection: "increase" },
  ],
  albums: [],
  tasks: [
    { id: "plan-date", listId: "partner", name: "Plan Saturday breakfast", order: 0, cadence: null, completedAt: null, estimateMin: 15, impactTier: "medium", impactSign: 1, deadlineAt: now + (2 * DAY_MS) },
    { id: "call-mum", listId: "family", name: "Call Mum about the visit", order: 1, cadence: null, completedAt: null, estimateMin: 10, impactTier: "high", impactSign: 1, deadlineAt: now + DAY_MS },
    { id: "reply-isha", listId: "friends", name: "Reply to Isha", order: 2, cadence: null, completedAt: null, estimateMin: 5, impactTier: "low", impactSign: 1, deadlineAt: null },
    { id: "partner-checkin", listId: "partner", name: "Evening check-in", order: 3, cadence: "daily", completedAt: null, estimateMin: null, impactTier: "medium", impactSign: 1, deadlineAt: null, dailyWindows: [{ weekday, startMinute: routineStart, endMinute: routineEnd }] },
    { id: "family-call", listId: "family", name: "Family call", order: 4, cadence: "daily", completedAt: null, estimateMin: null, impactTier: "medium", impactSign: 1, deadlineAt: null, dailyWindows: [{ weekday, startMinute: 1140, endMinute: 1170 }] },
  ],
  sessions: [],
  plannedSessions: [{ id: "date-plan", taskId: "plan-date", start: now + DAY_MS, end: now + DAY_MS + (30 * MINUTE_MS) }],
  goals: [],
  goalTaskLinks: [],
  run: idleRun,
  deviceId: idleRun.deviceId,
};

export const WORK_STORY_SNAPSHOT = {
  lists: [
    { id: "launch", name: "Product launch", emoji: "🚀", order: 0, lifeArea: WORK_AREA_KEY, lifeDirection: "increase" },
    { id: "operations", name: "Operations", emoji: "⚙️", order: 1, lifeArea: WORK_AREA_KEY, lifeDirection: "increase" },
    { id: "learning", name: "Professional development", emoji: "📚", order: 2, lifeArea: WORK_AREA_KEY, lifeDirection: "increase" },
  ],
  albums: [
    { id: "launch-research", listId: "launch", name: "Research", order: 0 },
    { id: "launch-delivery", listId: "launch", name: "Delivery", order: 1 },
    { id: "ops-reporting", listId: "operations", name: "Reporting", order: 0 },
  ],
  tasks: [
    { id: "launch-brief", listId: "launch", name: "Draft launch brief", album: "Research", order: 0, cadence: null, completedAt: null, estimateMin: 45, impactTier: "high", impactSign: 1, deadlineAt: now + (2 * DAY_MS) },
    { id: "release-copy", listId: "launch", name: "Review release copy", album: "Delivery", order: 1, cadence: null, completedAt: null, estimateMin: 30, impactTier: "medium", impactSign: 1, deadlineAt: now + (4 * DAY_MS) },
    { id: "metrics", listId: "operations", name: "Prepare weekly metrics", album: "Reporting", order: 2, cadence: null, completedAt: null, estimateMin: 25, impactTier: "medium", impactSign: 1, deadlineAt: now + DAY_MS },
    { id: "course-module", listId: "learning", name: "Finish course module", order: 3, cadence: null, completedAt: null, estimateMin: 40, impactTier: "low", impactSign: 1, deadlineAt: null },
    { id: "weekly-review", listId: "operations", name: "Weekly review", order: 4, cadence: "daily", completedAt: null, estimateMin: null, impactTier: "medium", impactSign: 1, deadlineAt: null, dailyWindows: [{ weekday, startMinute: routineStart, endMinute: routineEnd }] },
    { id: "research-complete", listId: "launch", name: "Interview users", album: "Research", order: 5, cadence: null, completedAt: now - DAY_MS, estimateMin: 30, impactTier: "medium", impactSign: 1, deadlineAt: null },
  ],
  sessions: [{ id: "research-session", taskId: "research-complete", start: now - DAY_MS, end: now - DAY_MS + (30 * MINUTE_MS) }],
  plannedSessions: [{ id: "brief-plan", taskId: "launch-brief", start: now + (2 * 60 * MINUTE_MS), end: now + (2 * 60 * MINUTE_MS) + (45 * MINUTE_MS) }],
  goals: [],
  goalTaskLinks: [],
  run: idleRun,
  deviceId: idleRun.deviceId,
};

export const adaptiveStoryHelpers = (snapshot) => ({
  attentionTasks: () => snapshot.tasks.filter((task) => task.deadlineAt),
  taskSessions: (taskId) => snapshot.sessions.filter((session) => session.taskId === taskId),
  taskTotal: (taskId) => snapshot.sessions
    .filter((session) => session.taskId === taskId)
    .reduce((total, session) => total + session.end - session.start, 0),
  logicalSessions: () => snapshot.sessions.map((session) => ({
    id: session.id,
    taskId: session.taskId,
    finishedAt: session.end,
    focusMs: session.end - session.start,
    breakMs: 0,
    focusIntervals: [{ start: session.start, end: session.end }],
  })),
});
