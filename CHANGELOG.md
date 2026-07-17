# Changelog

All notable user-visible changes to TaskPlayer are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions use
[Semantic Versioning](https://semver.org/). Add new work under **Unreleased**; during a release,
move those entries into a dated version section.

## 0.9.2 - 2026-07-17

### Changed

- Fixed Add/Edit Session crashing during its closing animation after Save or Cancel cleared the
  active dialog state.
- Task detail session rows now show explicit start and end times. Add Session and Edit Session use
  validated 24-hour `HH:mm` fields on one row beneath the date, reject equal times, and support
  overnight ranges by treating an earlier end time as the next day.
- Focus music now fades between silence and full app volume over two seconds when normally
  starting or stopping. Detected external-media and meeting interruptions stop without fading,
  and macOS system volume is unchanged.
- External audio detection now uses a reliable 500 ms Core Audio process-state scan after native
  process-property events proved inconsistent across media apps. Focus music pauses on the first
  detected scan and waits for one quiet second before resuming.
- Fixed a Spotify takeover loop where Spotify's paused-but-still-active Core Audio stream could
  make TaskPlayer restore Spotify, briefly resume focus music, and repeat. Already-paused player
  state now preserves an existing ownership lease without issuing Play.
- Daily Jam is now a per–Life Area attention queue. It shows up to three unfinished tasks ranked
  by active/scheduled-now state, deadline proximity, today's repeating schedule, impact, and
  least-recent touch, with a quiet reason for each selection. Completed routines leave the queue
  while remaining reflected in today's progress. The grid uses three columns on larger windows
  and two on smaller windows.
## 0.9.1

### Added

- Added a default-on focus-music interruption monitor on supported macOS versions, with an
  explicit opt-out synced through the signed-in account's new `user_settings` record.
  Other app audio or microphone activity pauses music within one scan and resumes it after one
  quiet second, while manual pause/play intent remains authoritative. Detection uses
  Core Audio process state only and never records, stores, or transmits audio.
- Added an opt-in Apple Music and Spotify takeover mode. While TaskPlayer focus music is active,
  it can pause either supported player and later resume only playback for which it holds a local
  ownership lease. Meetings and unsupported media players retain the normal yield behavior.
- Added a dedicated Focus Music settings section containing interruption and player-takeover
  controls instead of mixing playback coordination into Notifications.
- Added favorite songs with heart controls in the mini-player and track detail. Favorites persist
  offline, sync across signed-in devices, and can be replayed later through the Favorites vibe.
- Added weekday-specific repeating tasks, including an explicit Every day mode and combinations
  such as Saturday/Sunday. Daily Jam, task status, Now Playing, and deterministic rewards now
  respect whether a repeating task is scheduled for the current day.
- Added Noise, Nature, Coffee House, Game OST, and Energizing focus vibes. Noise is generated
  locally, Nature covers filtered rain/river/wind soundscapes, and Ambient now includes relevant
  singing-bowl tracks.
- Added macOS media-key and Now Playing integration for focus music, including play, pause,
  previous/next track actions, and current track metadata while TaskPlayer is unfocused.
- Added an inline, rotating circular sync icon next to “Life Areas” in the sidebar in [App.tsx](file:///Users/subham/Desktop/homebrew-taskplayer/src/app/App.tsx) when sync is in progress, replacing detached full-screen toast alerts to minimize distraction and satisfy the ADHD point-of-performance rule.
- Added a failure toast notification if manual/full database sync fails.
- Created `<AnimatedModal>`, `<AnimatedPage>`, `<AnimatedToast>`, `<AnimatedContextMenu>`, `<AnimatedSlidePanel>`, and `<AnimatedSpinner>` helper wrapper components in [motion-transitions.tsx](file:///Users/subham/Desktop/homebrew-taskplayer/src/app/components/motion-transitions.tsx) to completely abstract and centralize Framer Motion layout transition logic, preventing inline motion.div pollution across UI components.
- Integrated fluid UI animations via `motion/react` (Framer Motion v12) on page transitions, task/list modals, session logging forms, toast messages, and task option context menus.
- App-wide zoom controls using `⌘+` and `⌘−`, limited to 80–130%, with `⌘0` resetting to 100%.
- Insights now starts with quick-glance totals for today and all-time tracked time, completed
  tasks, lists, today's jewels, and lifetime net jewels.

### Changed

- Increased Life Area icons to 20px and enlarged the sidebar heading, area labels, list names, and
  list emoji for clearer scanning.
- Replaced repeated sidebar folder icons with distinct Lucide symbols for Career, Health,
  Relationships, Finances, and Recreation; Unsorted uses a neutral Inbox icon.
- Removed the planning-priority info icon from the Life Areas heading, leaving a single compact
  expand/collapse control.
- Renamed the sidebar heading from “Your Lists” to “Life Areas” to reflect its actual hierarchy.
- Removed the redundant three-dot menu trigger from active and completed task-list rows; selecting
  the row continues to open task detail directly.
- Increased the left sidebar width from 258px to 280px so list and life-area labels have more room.
- Reworked Audius loading around per-vibe genre/search sources, relevance filters, mood
  preferences, deduplication, and deterministic play-count ranking. Legacy Jazz and Electronic
  selections migrate to Coffee House and Energizing.
- Replaced the bottom player's unlabeled vibe dot with a compact current-vibe label that opens the
  native genre picker when clicked.
- Replaced the bottom player's text-like task-history glyph with Lucide's History icon.
- Removed the Lyrics icon from the bottom player; task notes remain available in task detail and
  on the Now Playing focus page.
- Reduced the bottom player's session progress bar width by 25%, from 540px to 405px.
- Fixed the bottom music player at 30% width and added an overflow-aware Motion marquee for long
  track titles, with a static reduced-motion fallback.
- Removed the focus-music volume and mute controls; playback now follows macOS system volume
  without a second app-specific volume level.
- Edit List now opens its emoji picker from the list preview and hides the full grid until needed,
  reducing visual distraction while retaining enough dialog width for availability details.
- Unified list-row and life-area drag grips with the same inline alignment, width, hover treatment,
  and Lucide icon styling.
- Extracted `ALBUM_PALETTE` color values to [constants.tsx](file:///Users/subham/Desktop/homebrew-taskplayer/src/app/constants.tsx) and updated its usage in [utils.tsx](file:///Users/subham/Desktop/homebrew-taskplayer/src/app/utils.tsx).
- Extracted core utility constants (`IMPACT_TIERS`, `IMPACT_TIER_KEYS`, `RANKS`, `RANK_AREA_CAP_RATIO`, and `UNTAGGED_LIST_COLOR`) from [utils.tsx](file:///Users/subham/Desktop/homebrew-taskplayer/src/app/utils.tsx) to [constants.tsx](file:///Users/subham/Desktop/homebrew-taskplayer/src/app/constants.tsx).
- Extracted all toast notification message strings (e.g. `List created`, `List saved`, `List deleted`, `Task created`, `Task saved`, `Task renamed`, `Task deleted`, and planning priority titles) to [constants.tsx](file:///Users/subham/Desktop/homebrew-taskplayer/src/app/constants.tsx) for central management.
- Extracted default list styles (`DEFAULT_LIST_COLOR`, `DEFAULT_LIST_EMOJI`) to [constants.tsx](file:///Users/subham/Desktop/homebrew-taskplayer/src/app/constants.tsx) and updated list creation/edition modals.
- Extracted modal assets (`EMOJI_CATEGORIES`, `DEPTH_ICONS`, and `CADENCE_ICONS`) to [constants.tsx](file:///Users/subham/Desktop/homebrew-taskplayer/src/app/constants.tsx) and updated task/list modal components to reuse them centrally.
- Extracted more constants (`ZOOM_MIN`/`MAX`/`STEP`, `TRACK_PX`, and `IMPACT_`/`LIFE_BALANCE_` calculation variables) to [constants.tsx](file:///Users/subham/Desktop/homebrew-taskplayer/src/app/constants.tsx) and updated their usages across context providers and layout pages.
- Extracted recent tasks size limit to use the central `RECENT_TASKS_SIZE` constant instead of hardcoded values.
- Migrated the entire frontend application rendering, layout, and control logic layer from lit-html to React + Vite, converting all core JS modules (.js) to JSX (.jsx).
- Removed all legacy DOM querying, HTML template string helpers, and imperative overlay dialogs in favor of native React state-driven dialogs, list modals, and new task forms.
- Fixed UI rendering lag by removing the global clock tick listener from the root App component, isolating the ticking updates to local intervals in the Player and Now Playing components.

- The bottom player's workflow icon now changes timer mode in place instead of opening the
  Settings workflow panel; detailed timing controls remain in Settings.
- The desktop window now opens at 1280×840 with a 1280×800 minimum, keeping the full workspace
  layout intact instead of compressing it into unsupported small-window states.
- One-time and Daily choices now use a smaller, compact selector in task detail.
- Personal Growth has been folded into Health & Wellbeing, leaving five clearer life areas.
  Existing and legacy-synced Personal Growth lists are normalized to Health without losing their
  tasks, sessions, direction, or planning data.
- List detail now uses a playlist-style header that brings list identity, life-area direction,
  availability, recorded progress, and a top-right Edit List icon together at the point of
  planning, with Add Task on a dedicated row directly below.
  Redundant list-wide Play controls and sidebar edit pencils have been removed.
- The six-metric aggregate summary now lives on Insights only and has been removed from Home,
  keeping Home focused on immediate task selection.
- Recent lists have been removed from Home because the sidebar already provides list navigation.
- Needs Attention has moved out of Home: qualifying lists now receive one calm, unnumbered
  muted-blue dot at the far right of their sidebar row, and the corresponding task rows show the
  same factual deadline cue in place without warning colors or urgency-based color changes.
- The active list's playing equalizer now moves with a subtle staggered rhythm, and the active task
  row uses the same animation instead of a static musical note. Both remain static when reduced
  motion is enabled.
- Now Playing is now a dedicated focus page opened from the current task identity in the bottom
  player. It keeps the familiar list panel for orientation, gives editable task context the
  primary workspace, shows separate mode-accurate current-session and overall-task progress, and
  returns to the exact prior page and scroll position. Playback stays in the global player instead
  of being duplicated on the page. Its current-session clock uses a calm tabular readout alongside
  the physical progress bar, avoiding attention-grabbing per-second animation. The task title is
  quieter and task editing remains in task detail instead of being duplicated on the focus page.
- Daily Jam now uses a responsive two-column life-area card grid ordered by planning priority,
  matching the app's existing flat list, folder, row, and hover-play styling while adding per-area
  progress, today's fixed-time cues, and compact inline expansion after four tasks.
- Core navigation and task-list surfaces now update in place through isolated `lit-html`
  components, reducing focus/interaction resets during timer and state refreshes.
- Daily Jam cards now reuse the same task-row component as list pages, keeping playback, session
  status, progress, jewels, active state, and row actions consistent across both surfaces.

### Fixed

- Fixed the malformed Keyboard Settings switch and its missing action wiring. The toggle now
  updates immediately, persists across launches, and the View shortcuts button opens the shared
  shortcut reference.
- Shifted the complete Life Areas expand/collapse control 4px right so its centered glyph aligns
  with the folder-row chevrons without creating uneven hover padding.
- Right-aligned the sidebar's expand/collapse control instead of letting it sit immediately after
  the Life Areas title.
- Restored Finder-style life-area folder opening and closing in the React sidebar, with smooth
  height, reveal, fade, and chevron motion plus an instant reduced-motion fallback.
- Aligned the bottom player's workflow-mode and History icons inside matching control boxes.
- Fixed weekly schedule day and time controls remaining at their initial values by using explicit
  weekday buttons, immediate time-input events, and guarding list-form initialization.
- Removed the duplicate divider above availability in Edit List.
- Restored sticky mini-headers on scrolling detail pages and replaced the fixed-height animated
  page wrapper with a growable minimum-height layout, preventing cropped top spacing.
- Made life-area reordering match list-row dragging: the full header now starts the drag and uses
  the same subdued in-drag feedback instead of requiring the small grip target.
- Fixed menu-bar focus-music Play/Pause and Next Track events being dropped when snapshot updates
  repeatedly recreated their listeners; controls now route directly to the music provider.
- Fixed task detail save and inline rename actions not displaying user-visible toast notifications; added "Task saved" and "Task renamed" toasts.
- Fixed a TypeError crash when clicking on a list item that groups tasks by album.
- Fixed an infinite render loop causing "Maximum update depth exceeded" when displaying or editing sessions.
- Fixed components redefining their own legacy/incorrect lists of life areas; restored the centralized LIFE_AREAS definition (Career / Work, Health & Wellbeing, Relationships, Finances, and Recreation) imported from utils.tsx.
- Lit task pages now render inside a dedicated component host, preventing Home, Insights, or
  Settings markup from surviving or replacing a sidebar navigation result.


## 0.9.1 - 2026-07-16

### Added

- Music curation increased
- Added repetition as extension of daily

### Changed

- cleanup


### Fixed
- N/A



## 0.8.1 - 2026-07-15

### Changed

- GitHub release pages now publish structured Added, Changed, and Fixed notes directly from the
  matching `CHANGELOG.md` version section.

### Fixed

- Upgrading from a client that ignored newer planner columns now performs a one-time remote-first
  field backfill before pushing, restoring list availability, task type, daily windows, session
  limits, and life-area priority without replacing unrelated local edits.

## 0.8.0 - 2026-07-15

### Added

- Daily and one-time task types with separate list sections and appropriate task fields.
- Multiple weekly availability windows for lists.
- Multiple fixed-time windows for daily tasks.
- Overnight time windows with an automatic “Next day” cue.
- Minimum and maximum session-size fields for one-time tasks.
- Draggable life-area planning priority stored locally and synced through Supabase.
- Reactive life-area reorder feedback through the central toast.
- Schedule notifications for approaching/ending daily and list windows.
- Five recently played incomplete tasks in the tray menu.
- Note/check tray artwork with white idle, green work, and yellow break states.
- Backward-compatibility release gates for historical SQLite upgrades, old sync payloads,
  Supabase capability checks, fresh backend migrations, and destructive-schema detection.

### Changed

- Jump Back In now appears immediately after Home summary stats and before all other sections.
- Pomodoro now starts breaks and subsequent work blocks automatically at their boundaries;
  notifications report each transition without requiring manual Start Break/Start Work clicks.
- Create Task now uses the same two-column detail layout as Edit Task.
- Task terminology now uses “Effort” and “Repeat.”
- Daily tasks no longer show estimates or deadlines.
- Daily rows show today’s session information instead of lifetime progress.
- Task lists group Daily tasks above One-time tasks with larger blue labels.
- List/life-area expand and collapse motion is slower and more Finder-like.
- List delete now aligns with Save and Cancel in the dialog footer.

### Fixed

- Concurrent timer, sync, and UI refresh work no longer risks deadlocking and freezing the app.
- Cross-device session state recovers from transient access-token failures without discarding a
  valid refresh token.
- Overnight daily routines no longer require splitting one occurrence into two artificial rows.


## 0.9.0 - 2026-07-15

### Added

- Simplified UI for playing, 
- added notification for attention tasks.

### Changed

- cleaned home to show few things.


### Fixed
- N/A


## Historical releases

- Release history through app version 0.7.4 has not been reconstructed. Git tags and GitHub
  Releases remain the source for older release details.
- Maintained version sections begin with the next release cut from **Unreleased**.
