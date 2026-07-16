import React from "react";

export const ATTENTION_TASKS_SIZE = 6;
export const RECENT_TASKS_SIZE = 6;
export const RECENT_LISTS_SIZE = 3;

// Zoom Levels
export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 1.3;
export const ZOOM_STEP = 0.1;

// Insights Page Timeline
export const TRACK_PX = 640;

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
};
export const MUSIC_DEFAULTS = {
  genre: "lofi",
};
export const MUSIC_COPY = {
  fallbackArtist: "Audius",
  fallbackTitle: "Focus music",
  loadingTitle: "finding tracks…",
  changeVibeTitle: "Change vibe",
};
export const MEDIA_SESSION_ACTIONS = {
  play: "play",
  pause: "pause",
  next: "nexttrack",
  previous: "previoustrack",
} as const;
export const MUSIC_PLAYER_WIDTH = "25%";
export const MUSIC_MARQUEE_GAP_PX = 32;
export const MUSIC_MARQUEE_MIN_DURATION_SECONDS = 8;
export const MUSIC_MARQUEE_PIXELS_PER_SECOND = 24;
export const PLAYER_HISTORY_ICON_SIZE = 18;

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
  dailyJamEmpty: "No tasks scheduled here today.",
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
