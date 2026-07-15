# TaskPlayer feature catalog

Last reviewed: 2026-07-15  
Applies to: TaskPlayer 0.8.1
Primary platform: macOS desktop

This is the authoritative record of what TaskPlayer does now. It describes shipped
behavior, foundations that exist without a complete user workflow, and known gaps. It is
not a roadmap or release history.

Status labels:

- **Shipped** — usable through the current app.
- **Foundation** — data or UI exists, but the complete product behavior does not.
- **Known gap** — an intended or implied behavior that is not complete.

Release history belongs in [`CHANGELOG.md`](../CHANGELOG.md). Product and architecture
rationale belongs in [`docs/decisions/`](decisions/) or a focused design specification.

## 1. App shell and navigation

### Native macOS app — Shipped

- Tauri v2 desktop shell around a Rust core and web UI.
- Closing the main window keeps TaskPlayer running in the menu bar.
- Development and installed builds use separate bundle identifiers, app-data directories,
  OAuth callback schemes, titles, and tray tooltips.
- Native application logs are written under `~/Library/Logs/TaskPlayer`.

### Main navigation — Shipped

- Home dashboard.
- Life-area and list sidebar.
- Individual task-list pages.
- Pinned Insights page.
- Settings page.
- Dedicated Now Playing focus page and task/track overlays.
- The desktop window opens at 1280×840 and cannot be resized below 1280×800, preserving the
  sidebar, task workspace, and bottom player without a compact mobile layout.
- Clicking the current task identity in the bottom player opens Now Playing as a dedicated page.
  It keeps the familiar list panel for orientation, keeps playback in the global player, and
  restores the exact previous page and scroll position on Back.
- Back/forward navigation with animated page transitions and `⌘[` / `⌘]` shortcuts.
- Sticky mini-headers appear after large page headers scroll away.

### Search — Shipped

- Live top-bar search over list names and incomplete task names.
- Shows up to four matching lists and eight matching tasks.
- Selecting a list opens it; selecting a task opens its list and task detail.
- `/` focuses search and Escape clears it.

### Keyboard control — Shipped

- Optional single-key shortcut mode in Settings.
- `⌘+` and `⌘−` zoom the full app interface in 10% steps from 80% to 130%; `⌘0` resets to 100%.
- Tab and Shift+Tab cycle the visible sidebar, main content, and player regions.
- `j` / `k` move through list or task rows; Enter activates the focused row.
- Space plays or pauses the active, focused, or last-played task.
- `n` creates a list, task, or session according to the focused region.
- `i` opens Insights, `s` opens Settings, `/` focuses search, and `?` shows help.
- Shortcuts are suppressed while typing, while overlays are open, or when modifier keys are
  held.

### Motion and feedback — Shipped

- Finder-style animated expansion/collapse for life-area, list, and completed-task groups.
- Motion-based list/life-area drag reordering.
- A single centered toast component is the app-wide transient feedback channel.
- Life-area reorder feedback explains the relationship created by the move.
- The top bar, pinned navigation, grouped sidebar, task-list page, task rows, sticky task header,
  and Daily Jam update through isolated `lit-html` components. Re-renders patch those surfaces in
  place, preserving their DOM identity and automatically escaping displayed task/list text.

## 2. Lists and life areas

### List management — Shipped

- Create, edit, rename, reorder, and delete lists.
- Choose an emoji from a curated, paged picker.
- Deleting a list soft-deletes its tasks and sessions for sync safety.
- Lists display incomplete/done counts, tracked time, and combined estimates.
- Tasks can be dragged between lists and album sections.

### Life-area filing — Shipped

- Five fixed areas: Career / Work, Health & Wellbeing, Relationships, Finances, and Recreation.
- Personal Growth is folded into Health & Wellbeing. Legacy `growth` values from supported older
  clients are accepted and normalized instead of appearing as Unsorted.
- Lists may be left Unsorted.
- A list may count **for** or **against** its area.
- List color is derived from its life area; Unsorted uses neutral gray.
- Sidebar sections are collapsible and remember their UI state locally.
- Dragging a list between life-area sections changes its area and derived color.

### Life-area planning priority — Shipped foundation

- Life areas can be reordered in the sidebar from most to least important.
- The drag handle appears on hover.
- An info dialog explains the priority meaning with an example.
- Priority order is stored in SQLite and synced through Supabase.
- **Known gap:** priority is not yet enforced when starting a task or adding a session.
- **Known gap:** the automatic planner does not yet consume priority order.

### List availability windows — Shipped foundation

- List create/edit supports multiple weekly availability rows.
- Each row independently selects any combination of Monday through Sunday.
- Each row has start and end times.
- End times earlier than start times mean the following day and show a visible “Next day”
  cue.
- Equal start/end times are rejected as ambiguous.
- Availability is stored in SQLite and synced through Supabase.
- **Known gap:** availability does not yet constrain manual task starts or session entry.
- **Known gap:** availability is not yet visualized in a Today/next-seven-days planner.

## 3. Tasks

### Task management — Shipped

- Create and edit use the same two-column task-detail layout.
- The One-time/Daily repeat selector uses compact horizontal pills so it does not compete with
  the primary task fields.
- Rename, move, reorder, delete, complete/uncomplete, and group tasks into free-form albums.
- Add or edit notes (“Lyrics”) inline or from the dedicated overlay.
- The Now Playing focus page keeps the current task’s free-form context directly editable and
  pairs it with two glanceable progress surfaces: the current session and the task overall.
  Open sessions use a running clock without an invented percentage; Target sessions fill against
  the configured target; Pomodoro work and break phases fill against their configured block
  lengths. The live clock uses a calm, static tabular readout alongside the mode-appropriate
  progress bar or open-session ruler. One-time task progress uses tracked time against its estimate, while Daily
  progress is limited to today. Playback remains in the persistent bottom player instead of being
  duplicated, and task editing stays in task detail rather than adding another action here.
- Mark effort as Deep, Shallow, or None.
- Set deterministic impact as Low, Medium, High, or untagged.
- Set impact direction as for/against the list’s life area.
- Move a task to another list from task detail.
- List detail uses a playlist-style hero with cover art, track/completion counts, recorded time,
  life-area direction, a compact availability summary, and a physical tracked-versus-estimated
  time bar. A top-right Edit List icon stays in the hero while Add Task gets its own row directly
  below it; there is no list-wide Play action, and the sidebar no longer carries edit pencils.
- Task lists show Daily tasks first and One-time tasks below, with blue section labels.
- Completed tasks live in an animated collapsible section.

### One-time tasks — Shipped

- Optional estimate in minutes/hours.
- Optional deadline.
- Optional minimum and maximum useful session size.
- Completion is terminal until manually unchecked.
- Deterministic jewels pay once on completion when an impact tier is set.
- Estimate progress is shown physically as session segments inside a capacity bar.
- Going over estimate remains visible without punitive color or language.

### Daily tasks — Partially shipped

- Repeat can be set to Daily.
- Estimates and deadlines are hidden because they do not describe repeating routines well.
- Daily rows show today’s session count and tracked time instead of lifetime estimate progress.
- Daily Jam groups positive daily tasks into a two-column life-area card grid ordered by the
  sidebar's life-area priority. Each card keeps unfinished-today items first, shows today's
  progress and earliest fixed time, reuses the task-list row with play, session, progress, jewel,
  and menu controls, and initially exposes up to four tasks with inline expansion.
- The five life-area cards remain visible as a stable map; tasks without a life area appear in an
  additional Unsorted card so older or partially synced data is never hidden.
- Daily rewards are derived from whether a session started on that local calendar day; no
  streak or missed-day history is stored.
- **Known gap:** the generic list-row checkbox still writes terminal `completed_at`, while
  Daily Jam and rewards use per-day sessions. Daily check/uncheck needs a dedicated per-day
  completion command so it resets correctly and does not remove the routine permanently.

### Daily time windows — Shipped foundation

- Multiple weekly time rows per daily task.
- Any combination of weekdays per row.
- Overnight rows use one occurrence, selected weekday as the starting day, and a “Next day”
  cue.
- Equal start/end times are rejected.
- Stored in SQLite and synced through Supabase.
- Used by schedule notifications.
- **Known gap:** these occurrences are not yet rendered as calendar blocks.

### Sessions and history — Shipped

- Playing, stopping, or switching tasks logs sessions automatically.
- Only one task can be active at a time.
- Switching tasks closes the previous work segment before starting the next.
- Session history shows start, end, and duration.
- Sessions can be added, edited, and deleted manually.
- Task detail shows session count and time; Insights provides cross-task history.
- Sleep/wake gap detection closes a running session at the last known awake tick rather than
  counting computer sleep as work.

## 4. Timer and player

### Persistent player — Shipped

- Bottom player shows the active/last task, list, live elapsed time, and task progress.
- Its workflow icon cycles the timer mode immediately without opening Settings; detailed mode
  lengths remain in Settings.
- Play/pause/stop controls are available from task rows, player, keyboard, and tray.
- Another device’s live task is shown read-only with a “play here” takeover action.
- Timer state continues while the main window is closed.

### Open mode — Shipped

- Stopwatch runs until stopped.
- Optional quiet hourly check-in after each full hour of continuous work.
- Check-in has no sound and uses supportive, non-punitive copy.

### Target mode — Shipped

- Configurable target length from 1 to 240 minutes.
- A physical progress bar fills toward the target and pulses when reached.
- One notification fires per work segment at the target.
- Time continues counting after the target instead of forcing a stop.

### Pomodoro mode — Shipped

- Configurable work, short-break, long-break, and cycles-before-long-break lengths.
- Work blocks auto-log when their boundary is reached.
- Work-to-break starts the break automatically and sends a notification without stealing focus.
- Break-to-work starts the next work block automatically and sends another notification without
  forcing the main window forward.
- Separate system sounds for break time and return-to-work.
- Focus music pauses on breaks and resumes with work.

## 5. Menu-bar tray

### Tray status — Shipped

- Note/check artwork replaces the former play triangle while preserving the original tray
  implementation.
- Idle is white, active work is green, and break/awaiting state is yellow.
- Active title shows the task name and live time; break state includes a coffee marker.
- Tray menu exposes the current task, play/pause, focus-music play/pause, next track, Open,
  and Quit.
- Shows up to five recently played incomplete tasks, excluding the current task.
- Selecting a recent task starts it.

## 6. Notifications

### Timer notifications — Shipped

- Pomodoro work complete / break ready.
- Pomodoro break complete / work ready.
- Target reached once per work segment.
- Optional Open-mode hourly check-in.
- Background update available.
- Notification permission is requested at startup.
- Settings links directly to macOS Notification Settings and explains persistent Alerts.

### Schedule notifications — Shipped

- Daily start approaching: five minutes before an incomplete daily window.
- Daily ending: at the window end while incomplete.
- List start approaching: five minutes before a list window when it contains an incomplete
  one-time task; the first task by list order is named.
- List ending: five minutes before the window ends, only when a task from that list is actively
  running.
- Overnight and near-midnight occurrences use the selected start weekday correctly.
- Events are checked every ten seconds and deduped per occurrence in temporary memory.
- For signed-in accounts, the current session-owning device is the notification leader to reduce
  cross-device duplicates.
- **Known gap:** per-window bell controls and custom lead times are not implemented.
- **Known gap:** native notification buttons such as Complete, Remind in 5 minutes, Start task,
  and Finish session are not exposed by the current macOS Tauri notification integration.
- **Known gap:** reminders require the desktop app to be running in the tray.

## 7. Home dashboard

### Quick-glance overview — Shipped

- Time-of-day greeting and today’s tracked time.
- Current rank badge.
- Jump Back In is the first section after the greeting, with up to six recently played distinct
  tasks. Aggregate time, completion, list, and jewel totals live on Insights instead.
- Daily Jam with today-only completion state, priority-ordered life-area cards, fixed-time cues,
  and the existing open/play controls at each task row.
- Life balance for the trailing seven days.
- List navigation stays in the sidebar instead of being duplicated on Home.
- Sections are intentionally bounded; no open-ended reward feed exists.

### Distributed attention cues — Shipped

- Eligible tasks require a deadline plus Medium or High impact.
- Scoring combines impact, deadline proximity, and lack of recent work.
- The derived set is capped at six and excludes the actively running task.
- A list containing a qualifying task gets one calm, unnumbered muted-blue dot at the far right of
  its sidebar row.
- The actively recording list uses a subtly animated three-bar equalizer. The active task row uses
  the same live indicator in place of its static musical note; reduced-motion mode keeps both
  indicators static.
- The corresponding task row uses the same fixed muted blue for its bounded deadline bar and
  shows a factual due date beside the existing deterministic jewel preview.
- Attention color never varies by life area or urgency; life-area colors remain category identity.
- No separate Needs Attention destination, notification count, stored failure history, or
  unexplained score is shown.

### Life balance — Shipped

- Five-axis radar based on the trailing seven days.
- Impact-weighted task contributions inherit their list’s life area and direction.
- Optional view of what is pulling against an area.
- Seven-day area grid supports drill-down to contributing tasks.
- No permanent failure or imbalance tally is stored.

## 8. Gamification

### Deterministic jewels — Shipped

- Low pays 1, Medium pays 2, and High pays 4 jewels.
- Reward amount is visible before work/completion.
- One-time tasks pay once on completion.
- Daily tasks pay per qualifying day/session.
- Against tasks produce explicitly signed negative contribution; rewards are never randomized.

### Rank — Shipped

- Six musical ranks: Pianissimo, Piano, Mezzo-forte, Forte, Fortissimo, and Crescendo.
- Thresholds are fixed and disclosed.
- Rank uses lifetime positive jewels and never demotes.
- A one-third per-area cap requires contribution across roughly three life areas, preventing one
  hyperfocused category from supplying the entire rank.
- Rank remains a quick-glance badge rather than a browsable progression destination.

## 9. Insights

### Session analytics — Shipped

- A static quick-glance summary shows time tracked today and all-time, completed tasks, lists,
  jewels earned today, and lifetime net jewels.
- Day, week, and month periods.
- Day view uses time-positioned session lanes and a current-time needle.
- Week view groups sessions by day and task.
- Month view shows daily density across the month.
- Expandable task/session groups with tracked-time totals.
- Uses real session shape and duration rather than only aggregate numbers.

## 10. Focus music

### Audius player — Shipped

- Streams artist-licensed / Creative Commons-compatible tracks from Audius without an API key.
- Genres: Lo-Fi, Ambient, Classical, Jazz, and Electronic.
- Uses trending tracks with search fallback and up to 50 shuffled candidates.
- Starts with work, pauses on break/stop, and resumes with work.
- Play/pause, next, volume, and genre controls.
- Genre and volume persist locally.
- Track detail shows artwork, artist, genre, and an Audius link.
- Artwork falls back through decentralized mirror URLs when a node fails.
- Music state is mirrored to the tray for independent tray controls.

## 11. Account and cross-device sync

### Local-first storage — Shipped

- SQLite is the source of truth on each device.
- Ordered, versioned migrations run automatically through `PRAGMA user_version`.
- Lists, tasks, sessions, configuration, run state, life-area priorities, and sync metadata are
  stored locally.
- Deletes are soft tombstones so they can propagate across devices.

### Google sign-in and Supabase sync — Shipped

- Google OAuth through Supabase Auth using PKCE and an app deep-link callback.
- Account avatar/name/email in Settings.
- Incremental push/pull sync approximately every 60 seconds while signed in.
- Manual Sync now and Full sync controls.
- Hourly full-resync safety net.
- Last-write-wins timestamps for lists, tasks, sessions, priorities, configuration, and run state.
- Explicit sign-in performs an authoritative pull before normal push/pull, preventing signed-out
  local edits from overwriting the account immediately on login.
- Access tokens refresh proactively and retry transient failures without discarding the refresh
  token.
- Sync status and recoverable errors are visible in Settings.
- A versioned backend capability contract is checked before sync; an older or partially migrated
  backend pauses sync without disabling local task management or playback.
- Supabase changes follow an additive compatibility window covering the current and previous two
  minor clients.
- After synced planner columns are added locally, a durable one-time remote-first backfill runs
  before any push. It restores fields an older client may have skipped without replacing unrelated
  local row edits, and retries automatically after transient failures.

### Live session ownership — Shipped

- One active session per account, Spotify-style.
- Remote active sessions mirror read-only on other devices.
- Playing on another device takes ownership; taking over the same task can continue its current
  position.
- Session ownership prevents duplicate timer transitions and most duplicate notifications.

## 12. Settings, data, and maintenance

### Settings albums — Shipped

- Account.
- Workflow / timer mode.
- Notifications.
- Keyboard.
- Diagnostics.
- About / updates.

### Backup and restore — Shipped

- Export lists, tasks, sessions, and configuration as JSON to Downloads and reveal it in Finder.
- Import replaces current local data after confirmation.
- Import resets orphaned run state and refreshes the UI.

### Diagnostics — Shipped

- Panic guards keep long-running background loops alive and write failures to the log.
- Snapshot and restore reads avoid overlapping application-state locks, keeping concurrent timer,
  sync, and UI refresh work responsive.
- Reveal log file from Settings.
- Sync failures are surfaced instead of remaining silent.

### Updates and release — Shipped

- Manual update check in Settings.
- Background update check after launch and every four hours.
- Signed updater artifacts and confirmation before install/restart.
- Release script bumps versions, builds Tauri bundles, creates updater metadata, updates the
  Homebrew cask, commits/tags, and can publish a GitHub release.
- GitHub release pages use the matching changelog section, preserving structured Added, Changed,
  and Fixed notes instead of showing only generated commit titles.
- GitHub Actions can run the release workflow.
- Pull requests and `main` run compatibility gates for historical SQLite upgrades, old sync
  payloads, fresh Supabase migrations, old-client field preservation, and destructive SQL.

## 13. Planner status

### Existing foundations

- List availability windows.
- Daily fixed-time windows, including overnight occurrences.
- One-time task estimates, deadlines, and minimum/maximum session sizes.
- Global life-area priority order.
- Schedule-boundary notifications.

### Not shipped yet

- Automatic allocation of one-time-task sessions into available list windows.
- Today and next-seven-days calendar views.
- Capacity/feasibility validation against estimates, deadlines, and available time.
- Conflict warnings when a lower-priority area tries to use a higher-priority window.
- Manual planned-session calendar blocks and rescheduling.
- A full iOS app and iOS notification actions.

## 14. Documentation map

- [`adhd-design-principles.md`](adhd-design-principles.md) — non-negotiable product constraints.
- [`homepage-now-spec.md`](homepage-now-spec.md) — original Needs Attention design scope; status
  header needs retrospective updating.
- [`pomodoro-user-stories.md`](pomodoro-user-stories.md) — Pomodoro research and stories.
- [`session-sync-design.md`](session-sync-design.md) — original session-sync design; status header
  needs retrospective updating.
- [`compatibility-policy.md`](compatibility-policy.md) — storage, sync, migration, and client
  support contract.
- [`ui-architecture-assessment.md`](ui-architecture-assessment.md) — UI architecture assessment.
- [`decisions/`](decisions/) — durable product and architecture decisions going forward.
