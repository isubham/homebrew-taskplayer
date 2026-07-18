import React from "react";

export const ATTENTION_TASKS_SIZE = 6;
export const RECENT_TASKS_SIZE = 6;
export const RECENT_LISTS_SIZE = 3;
export const DAILY_JAM_TASK_LIMIT = 3;
export const DAILY_JAM_DUE_SOON_DAYS = 7;
export const DAILY_JAM_SCHEDULE_LEAD_MINUTES = 60;
export const DAILY_JAM_COPY = {
  heading: "Daily Jam",
  subtitle: "What needs attention next",
  inProgress: "In progress",
  scheduledToday: "Scheduled today",
  scheduledAt: (timeLabel) => `Today at ${timeLabel}`,
  impact: (label) => `${label} impact`,
  taskCount: (count) => `${count} task${count === 1 ? "" : "s"}`,
  allClear: "All clear for today.",
};

// Zoom Levels
export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 1.3;
export const ZOOM_STEP = 0.1;

// Insights Page Timeline
export const TRACK_PX = 640;
export const INSIGHTS_ICON_SIZE = 15;

// Sticky page header selectors
export const STICKY_SCROLL_ROOT_SELECTOR = ".main";
export const STICKY_TITLE_SELECTOR = ".hdr .info h1";

// Tauri frontend event channels
export const TAURI_EVENT_STATE_CHANGED = "state-changed";
export const TAURI_EVENT_MUSIC_TOGGLE = "music-toggle";
export const TAURI_EVENT_MUSIC_NEXT = "music-next";

// Focus music and system media controls
export const MUSIC_APP_NAME = "TaskPlayer";
export const MUSIC_API_BASE = "https://api.audius.co";
export const MUSIC_STORAGE_KEYS = {
  genre: "tp.genre",
  favorites: "tp.musicFavorites",
};
export const MUSIC_DEFAULTS = {
  genre: "lofi",
};
export const MUSIC_FADE_DURATION_MS = 2_000;
export const MUSIC_FADE_TICK_MS = 50;
export const MUSIC_VOLUME_MUTED = 0;
export const MUSIC_VOLUME_FULL = 1;
export const SESSION_DEFAULT_DURATION_MINUTES = 30;
export const SESSION_MILLISECONDS_PER_MINUTE = 60_000;
export const SESSION_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const SESSION_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const SESSION_TIME_INPUT_MAX_LENGTH = 5;
export const SESSION_COPY = {
  dateLabel: "Date",
  startTimeLabel: "Start time",
  endTimeLabel: "End time",
  timePlaceholder: "HH:mm",
  invalidDate: "Choose a valid date.",
  invalidStartTime: "Enter the start time as HH:mm.",
  invalidEndTime: "Enter the end time as HH:mm.",
  equalTimes: "Start and end time must be different.",
  overnightHint: "An end time earlier than the start is saved as the next day.",
  liveEndLabel: "now",
  recordingLabel: "recording…",
};
export const MUSIC_COPY = {
  fallbackArtist: "Audius",
  fallbackTitle: "Focus music",
  loadingTitle: "finding tracks…",
  changeVibeTitle: "Change vibe",
  playTitle: "Play focus music",
  pauseTitle: "Pause focus music",
  previousTitle: "Previous track",
  nextTitle: "Next track",
  remoteSessionTitle: "Focus music is playing on the session-owning device",
  favoriteTitle: "Add to favorite songs",
  unfavoriteTitle: "Remove from favorite songs",
  noFavoritesTitle: "No favorite songs yet",
};
export const MUSIC_FAVORITES_VIBE_KEY = "favorites";
export const MEDIA_SESSION_ACTIONS = {
  play: "play",
  pause: "pause",
  next: "nexttrack",
  previous: "previoustrack",
} as const;
export const MUSIC_PLAYER_WIDTH = "20%";
export const MUSIC_MARQUEE_GAP_PX = 32;
export const MUSIC_MARQUEE_MIN_DURATION_SECONDS = 8;
export const MUSIC_MARQUEE_PIXELS_PER_SECOND = 24;
export const PLAYER_HISTORY_ICON_SIZE = 18;
export const MUSIC_MINI_CONTROL_ICON_SIZE = 16;
export const MUSIC_PRIMARY_CONTROL_ICON_SIZE = 16;

// Finder-style sidebar folder disclosure
export const SIDEBAR_FOLDER_MOTION = {
  openDurationSeconds: 0.22,
  closeDurationSeconds: 0.16,
  fadeDurationSeconds: 0.12,
  revealOffsetPx: -4,
  chevronSizePx: 16,
  ease: [0.22, 1, 0.36, 1] as const,
};
export const SIDEBAR_COPY = {
  lifeAreasHeading: "Life Areas",
  unsortedLabel: "Unsorted",
};
export const SIDEBAR_UNSORTED_KEY = "__unsorted__";
export const LIFE_AREA_ICON_SIZE_PX = 20;

export const TASK_REPEAT_COPY = {
  optionLabel: "Repeating",
  sectionLabel: "Repeating",
  emptySection: "No repeating tasks in this list.",
  scheduleHeading: "Repeat days and time",
  scheduleHint: "Choose the days this task should appear. Times create fixed scheduled occurrences.",
  scheduleDaysAriaLabel: "Repeat days",
  everyDayOption: "Every day",
  everyDayCaption: "Repeats every day. No finish line or streak kept.",
  selectedDaysPrefix: "Repeats on",
  selectedDaysSuffix: "No finish line or streak kept.",
  rewardTiming: "Earns once per scheduled day",
  rewardTitleSuffix: " per scheduled day",
  offDayStatus: "Not scheduled today",
  offDayNote: "This task returns on its selected days.",
  dailyJamEmpty: DAILY_JAM_COPY.allClear,
};

export const SETTINGS_DATA_COPY = {
  icon: "🗄️",
  color: "#509bf5",
  title: "Data",
  subtitle: "Account sync recovery",
  heading: "Sync repair",
  description: "Re-check every list, task, session, and favorite against your account. Use this when data from another device is missing.",
  repairLabel: "⟳ Repair data",
  repairingLabel: "⟳ Repairing…",
  signInHint: "Sign in to repair synced account data.",
};

export const SETTINGS_SECTION_STORAGE_KEY = "tp.settingsSection";
export const SETTINGS_NAV_LABEL = "Settings sections";
export const KEYBINDINGS_STORAGE_KEY = "tp.keybindings";
export const KEYBOARD_SETTINGS_COPY = {
  enableTitle: "Enable keyboard shortcuts",
  disableTitle: "Disable keyboard shortcuts",
  toggleLabel: "Toggle keyboard shortcuts",
  shortcutsTitle: "Shortcuts",
  shortcutsConfirmLabel: "Done",
  shortcutsHtml: `
    <div style="display:grid;grid-template-columns:auto auto;gap:6px 16px;font-size:13px">
      <div><kbd>Tab</kbd> / <kbd>Shift+Tab</kbd></div><div>Cycle focused region (Sidebar, main list, player)</div>
      <div><kbd>j</kbd> / <kbd>k</kbd></div><div>Move highlight down / up</div>
      <div><kbd>Enter</kbd></div><div>Select list / Play task</div>
      <div><kbd>Space</kbd></div><div>Play/Pause active track</div>
      <div><kbd>n</kbd></div><div>New task / New list / New session</div>
      <div><kbd>/</kbd></div><div>Focus search</div>
      <div><kbd>Escape</kbd></div><div>Clear focus / close modals</div>
      <div><kbd>o</kbd></div><div>Go to Home</div>
      <div><kbd>i</kbd></div><div>Go to Insights</div>
      <div><kbd>s</kbd></div><div>Go to Settings</div>
    </div>
  `,
};
export const SETTINGS_SECTIONS = [
  { key: "account", icon: "👤", color: "#509bf5", title: "Account", subtitle: "Sign-in & account" },
  { key: "workflow", icon: "⏱️", color: "#2f9e8f", title: "Workflow", subtitle: "Timer configuration" },
  { key: "notifications", icon: "🔔", color: "#f5a623", title: "Notifications", subtitle: "Sounds & alerts" },
  { key: "keyboard", icon: "⌨️", color: "#8d67ab", title: "Keyboard", subtitle: "Shortcuts" },
  { key: "data", icon: SETTINGS_DATA_COPY.icon, color: SETTINGS_DATA_COPY.color, title: SETTINGS_DATA_COPY.title, subtitle: SETTINGS_DATA_COPY.subtitle },
  { key: "diagnostics", icon: "🛠️", color: "#9aa0a6", title: "Diagnostics", subtitle: "Backups & logs" },
  { key: "about", icon: "ℹ️", color: "#6a6a6a", title: "About", subtitle: "Version & updates" },
] as const;

export const WORKFLOW_SETTINGS_COPY = {
  configurationHint: "Choose a workflow below to configure it. Your active workflow only changes from the player.",
};

// Impact and Life Balance Calculations
export const IMPACT_WEIGHT_TO_MS = 40 * 60 * 1000;
export const LIFE_BALANCE_CAP_MS = 5 * 60 * 60 * 1000;

// Shared Emojis
export const EMOJI_CATEGORIES = [
  { key: "work", label: "Work & Productivity", emojis: ["📁", "💼", "🎯", "📊", "📈", "🗂️", "📝", "✅", "⏰", "📅", "💻", "🖥️", "📌", "📎", "🖇️", "📇", "🖨️", "⌨️", "🖱️", "📠", "📋", "🗓️", "🗒️", "📮"] },
  { key: "home", label: "Home & Chores", emojis: ["🏠", "🛋️", "🛏️", "🚪", "🪴", "🧹", "🧺", "🧽", "🧴", "🔑", "🪑", "🚿", "🛁", "🧻", "🗑️", "🪟", "🕯️", "🧯", "🧼", "🛌", "🚰", "🧱", "🪞", "🪒"] },
  { key: "health", label: "Health & Fitness", emojis: ["🏋️", "🧘", "🏃", "🚴", "⚽", "🏀", "🎾", "🥗", "🍎", "💧", "😴", "🩺", "💊", "🧠", "👟", "🦵", "🏊", "🤸", "🥊", "🍏", "🫀", "🦶", "🧬", "🩹"] },
  { key: "money", label: "Money & Shopping", emojis: ["💰", "💳", "🏦", "🧾", "🛍️", "🪙", "💵", "📉", "🧮", "🛒", "🏷️", "💸", "📦", "🧧", "🪪", "💹", "💶", "💷", "🏧", "💲", "🎟️", "🛎️", "🗞️", "🏬"] },
  { key: "creative", label: "Creative & Hobbies", emojis: ["🎨", "🎵", "🎸", "🎬", "📷", "🎮", "🧵", "✂️", "🖌️", "📚", "✍️", "🎭", "🎹", "📸", "🖼️", "🎤", "🎻", "🥁", "🎺", "🧶", "🪡", "🎲", "🧸", "🪄"] },
  { key: "learning", label: "Learning & Growth", emojis: ["🎓", "📖", "🧠", "💡", "🔬", "🧪", "🧑‍🎓", "✏️", "🗣️", "🧩", "📐", "🔭", "🌐", "📔", "🧑‍🏫", "🏫", "📏", "📓", "📰", "🔎", "🧫", "🗄️", "🖋️", "🧑‍🔬"] },
  { key: "nature", label: "Nature & Animals", emojis: ["🌱", "🌳", "🌻", "🐾", "🐶", "🐱", "🦋", "🌊", "⛰️", "☀️", "🌙", "🔥", "🐦", "🐟", "🍀", "🌈", "🐢", "🦉", "🐝", "🌵", "🍂", "❄️", "⭐", "🌾"] },
  { key: "travel", label: "Travel & Places", emojis: ["✈️", "🚗", "🚆", "🏖️", "🗺️", "🎒", "🏕️", "🌍", "🚢", "🏨", "🚕", "🛳️", "🚲", "🛺", "⛺", "🧳", "🛫", "🛬", "🚉", "🗽", "🗼", "🏰", "🚀", "🛵"] },
  { key: "social", label: "Social & Celebrations", emojis: ["❤️", "👪", "👫", "💬", "🎉", "🎁", "🤝", "🎂", "🥳", "💌", "📞", "👋", "🫂", "💞", "🎊", "🗨️", "💍", "🥂", "🍾", "🎈", "🕺", "💃", "🧑‍🤝‍🧑", "🗯️"] },
];

export const EMOJI_PICKER_COPY = {
  dialogLabel: "Choose a list emoji",
  triggerTitle: "Change list emoji",
  previousTitle: "Previous emoji category",
  nextTitle: "Next emoji category",
  escapeKey: "Escape",
};

// Shared Icons
export const DEPTH_ICONS = {
  deep: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  ),
  shallow: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  ),
  none: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
    </svg>
  ),
};

export const CADENCE_ICONS = {
  once: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
  daily: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 2.1 21 6l-4 3.9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 21.9 3 18l4-3.9" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
};

// Defaults
export const DEFAULT_LIST_COLOR = "#6e6e6e";
export const DEFAULT_LIST_EMOJI = "📁";

// Toast Messages
export const TOAST_LIST_CREATED = "List created";
export const TOAST_LIST_SAVED = "List saved";
export const TOAST_LIST_DELETED = "List deleted";
export const TOAST_TASK_CREATED = "Task created";
export const TOAST_TASK_SAVED = "Task saved";
export const TOAST_TASK_RENAMED = "Task renamed";
export const TOAST_TASK_DELETED = "Task deleted";
export const TOAST_PLANNING_PRIORITY_UPDATED_TITLE = "Planning priority updated";

// Styling & Category Defaults
export const UNTAGGED_LIST_COLOR = "#6b6b6b";

// Impact Tiers
export const IMPACT_TIERS = {
  low: { label: "Low", weight: 1 },
  medium: { label: "Medium", weight: 2 },
  high: { label: "High", weight: 4 },
};
export const IMPACT_TIER_KEYS = ["low", "medium", "high"];

// Rank Progression Tiers
export const RANKS = [
  { key: "pp", label: "Pianissimo", sub: "just starting out", min: 0 },
  { key: "p", label: "Piano", sub: "quiet, steady progress", min: 15 },
  { key: "mf", label: "Mezzo-forte", sub: "building momentum", min: 50 },
  { key: "f", label: "Forte", sub: "strong and steady", min: 150 },
  { key: "ff", label: "Fortissimo", sub: "powerful, all in", min: 400 },
  { key: "cresc", label: "Crescendo", sub: "full swell", min: 1000 },
];
export const RANK_AREA_CAP_RATIO = 1 / 3;

// Palette for Deterministic Album Tile Colors
export const ALBUM_PALETTE = ["#509bf5", "#e8b923", "#8d67ab", "#e13300", "#27856a", "#e8115b", "#ba5d07", "#2f9e8f"];

// Sync Messages
export const TOAST_SYNCING = "Syncing data...";
export const TOAST_SYNC_COMPLETE = "Sync complete";
