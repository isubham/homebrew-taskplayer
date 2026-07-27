import { MUSIC_VIBES } from "../music-vibes";

const MINUTE_MS = 60_000;

export const COMPONENT_STORY_LABELS = {
  topbar: "TaskPlayer top bar component preview",
  player: "TaskPlayer mini-player component preview",
  taskList: "TaskPlayer task-list component preview",
};

export const COMPONENT_STORY_LIST = {
  id: "deep-work",
  name: "Deep Work",
  emoji: "🎧",
  color: "#509bf5",
  lifeArea: "career",
  lifeDirection: "increase",
  availabilityWindows: [
    { weekday: 1, startMinute: 540, endMinute: 720 },
    { weekday: 2, startMinute: 540, endMinute: 720 },
    { weekday: 3, startMinute: 540, endMinute: 720 },
    { weekday: 4, startMinute: 540, endMinute: 720 },
    { weekday: 5, startMinute: 540, endMinute: 720 },
  ],
};

export const COMPONENT_STORY_LISTS = [
  COMPONENT_STORY_LIST,
  {
    id: "health",
    name: "Morning Routine",
    emoji: "🌤️",
    color: "#3dbfac",
    lifeArea: "health",
  },
];

export const COMPONENT_STORY_TASKS = [
  {
    id: "write-brief",
    listId: COMPONENT_STORY_LIST.id,
    name: "Write the launch brief",
    estimateMin: 60,
    impactTier: "major",
    impactSign: 1,
    cadence: null,
    album: "Launch",
    completedAt: null,
    deadlineAt: Date.now() + (2 * 24 * 60 * MINUTE_MS),
  },
  {
    id: "research",
    listId: COMPONENT_STORY_LIST.id,
    name: "Research customer questions",
    estimateMin: 45,
    impactTier: "moderate",
    impactSign: 1,
    cadence: null,
    album: "Launch",
    completedAt: null,
    deadlineAt: null,
  },
  {
    id: "daily-plan",
    listId: COMPONENT_STORY_LIST.id,
    name: "Plan today’s focus block",
    estimateMin: null,
    impactTier: "small",
    impactSign: 1,
    cadence: "daily",
    dailyWindows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      startMinute: 540,
      endMinute: 570,
    })),
    completedAt: null,
    deadlineAt: null,
  },
  {
    id: "archive-notes",
    listId: COMPONENT_STORY_LIST.id,
    name: "Archive discovery notes",
    estimateMin: 20,
    impactTier: null,
    impactSign: 1,
    cadence: null,
    album: "",
    completedAt: Date.now() - (24 * 60 * MINUTE_MS),
    deadlineAt: null,
  },
];

export const COMPONENT_STORY_SESSIONS = [
  {
    id: "session-brief",
    taskId: "write-brief",
    start: Date.now() - (25 * MINUTE_MS),
    end: Date.now() - (5 * MINUTE_MS),
  },
  {
    id: "session-research",
    taskId: "research",
    start: Date.now() - (55 * MINUTE_MS),
    end: Date.now() - (40 * MINUTE_MS),
  },
];

export const COMPONENT_STORY_LOGICAL_SESSIONS = COMPONENT_STORY_SESSIONS.map((session) => ({
  id: session.id,
  taskId: session.taskId,
  finishedAt: session.end,
  focusMs: session.end - session.start,
  breakMs: 0,
  focusIntervals: [{ start: session.start, end: session.end }],
}));

export const COMPONENT_STORY_CONFIG = {
  mode: "target",
  targetMin: 50,
  workMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cyclesBeforeLongBreak: 4,
};

export const COMPONENT_STORY_IDLE_RUN = {
  activeTaskId: null,
  activeSessionId: null,
  lastTaskId: "write-brief",
  phase: null,
  runningStart: null,
  deviceId: "story-device",
  cyclesCompleted: 0,
};

export const COMPONENT_STORY_RUNNING_RUN = {
  ...COMPONENT_STORY_IDLE_RUN,
  activeTaskId: "write-brief",
  activeSessionId: "open-session",
  phase: "work",
  runningStart: Date.now() - (18 * MINUTE_MS),
};

export const COMPONENT_STORY_MUSIC = {
  musicState: {
    playing: true,
    enabled: true,
    flowMusicEnabled: true,
    loading: false,
    genre: "lofi",
    genreLabel: MUSIC_VIBES.lofi.label,
    name: "Quiet Signals — North Window",
    title: "Quiet Signals",
    artist: "North Window",
    favoriteCount: 3,
    isFavorite: true,
  },
  play: () => undefined,
  pause: () => undefined,
  next: () => undefined,
  previous: () => undefined,
  toggleFavorite: () => undefined,
  setGenre: () => undefined,
  setActive: () => undefined,
  setFlowMusicEnabled: () => undefined,
  GENRES: MUSIC_VIBES,
};

export const COMPONENT_STORY_ACTIONS = {
  addTask: () => undefined,
  closeRowMenu: () => undefined,
  cycleMode: () => undefined,
  editList: () => undefined,
  finishSession: () => undefined,
  goBack: () => undefined,
  goForward: () => undefined,
  goHome: () => undefined,
  navigate: () => undefined,
  play: () => undefined,
  resumeWork: () => undefined,
  selectList: () => undefined,
  setCompletedOpen: () => undefined,
  setOpenTaskId: () => undefined,
  skipBreak: () => undefined,
  startBreak: () => undefined,
  stop: () => undefined,
  toggleDone: () => undefined,
};

export const COMPONENT_STORY_TOPBAR_STATE = {
  navBack: [{ view: "home" }],
  navFwd: [],
  S: {
    lists: COMPONENT_STORY_LISTS,
    tasks: COMPONENT_STORY_TASKS,
  },
};

export const componentStoryList = (listId) => (
  COMPONENT_STORY_LISTS.find((listItem) => listItem.id === listId) || null
);

export const componentStoryTask = (taskId) => (
  COMPONENT_STORY_TASKS.find((task) => task.id === taskId) || null
);

export const componentStoryTaskSessions = (taskId) => (
  COMPONENT_STORY_SESSIONS.filter((session) => session.taskId === taskId)
);

export const componentStoryTaskTotal = (taskId) => (
  componentStoryTaskSessions(taskId).reduce(
    (total, session) => total + ((session.end || Date.now()) - session.start),
    0,
  )
);
