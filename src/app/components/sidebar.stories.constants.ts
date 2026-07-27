export const SIDEBAR_STORY_CONTAINER_LABEL = "TaskPlayer sidebar component preview";

export const SIDEBAR_STORY_SECTIONS = [
  {
    key: "work",
    dropArea: "work",
    label: "Work",
    color: "#509bf5",
    priorityRank: 1,
    items: [
      { id: "product-launch", emoji: "🚀", name: "Product launch" },
      { id: "deep-work", emoji: "🎧", name: "Deep work" },
    ],
  },
  {
    key: "health",
    dropArea: "health",
    label: "Health",
    color: "#3dbfac",
    priorityRank: 2,
    items: [
      { id: "morning-routine", emoji: "🌤️", name: "Morning routine" },
      { id: "movement", emoji: "🏃", name: "Movement" },
    ],
  },
  {
    key: "relationships",
    dropArea: "relationships",
    label: "Relationships",
    color: "#e8b923",
    priorityRank: 3,
    items: [],
  },
];

export const SIDEBAR_STORY_ACTIVE_LIST_ID = "deep-work";
export const SIDEBAR_STORY_PLAYING_LIST_ID = "product-launch";
export const SIDEBAR_STORY_ATTENTION_LIST_ID = "morning-routine";
export const SIDEBAR_STORY_INITIAL_COLLAPSED = {};
export const SIDEBAR_STORY_COLLAPSED = { health: true };
