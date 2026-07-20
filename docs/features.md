# TaskPlayer feature catalog

Last reviewed: 2026-07-19
Applies to: Unreleased after TaskPlayer 0.9.3
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
- Native application logs are written under `~/Library/Logs/TaskPlayer`. Every timer pause records
  a structured reason and trigger, task/phase timestamps, device id, and the outcome of both the
  session-history and run-state writes. Frontend triggers distinguish keyboard, task-row, player,
  menu, Home, and album actions; automatic causes identify sleep, Pomodoro, and sync transitions.

### Main navigation — Shipped

- Home dashboard.
- Life-area and list sidebar.
- Individual task-list pages.
- Pinned Planner page.
- Pinned Insights page.
- Settings page.
- Dedicated Now Playing focus page and task/track overlays.
- The left sidebar uses a 280px column so list and life-area labels have more room.
- Its hierarchy is labeled “Life Areas,” matching the five factual areas that organize lists.
- The list-heading expand/collapse control stays against the sidebar's right edge, with its glyph
  aligned to the life-area row chevrons.
- The desktop window opens at 1280×840 and cannot be resized below 1280×800, preserving the
  sidebar, task workspace, and bottom player without a compact mobile layout.
- Clicking the current task identity in the bottom player opens Now Playing as a dedicated page.
  It keeps the familiar list panel for orientation, keeps playback in the global player, and
  restores the exact previous page and scroll position on Back.
- Back/forward navigation with animated page transitions and `⌘[` / `⌘]` shortcuts.
- Sticky mini-headers appear after large page headers scroll away and remain visible throughout
  the growable page scroll surface without compressing or cropping the hero header.

### Search — Shipped

- Live top-bar search over list names and incomplete task names.
- Shows up to four matching lists and eight matching tasks.
- Selecting a list opens it; selecting a task opens its list and task detail.
- `/` focuses search and Escape clears it.

### Keyboard control — Shipped

- Optional single-key shortcut mode uses a persisted, accessible switch in Settings; its shortcut
  reference remains available there even while single-key controls are disabled.
- `⌘+` and `⌘−` zoom the full app interface in 10% steps from 80% to 130%; `⌘0` resets to 100%.
- Tab and Shift+Tab cycle the visible sidebar, main content, and player regions.
- `j` / `k` move through list or task rows; Enter activates the focused row.
- Space plays or pauses the active, focused, or last-played task.
- `n` creates a list, task, or session according to the focused region.
- `o` opens Home, `p` opens Planner, `i` opens Insights, `s` opens Settings, `/` focuses search,
  and `?` shows help.
- Shortcuts are suppressed while typing, while overlays are open, or when modifier keys are
  held.

### Motion and feedback — Shipped

- Life-area folders use a Finder-style disclosure animation: the contents smoothly resize,
  reveal, and fade with the rotating chevron, while reduced-motion mode changes state instantly.
- List and completed-task groups use animated expansion/collapse.
- Motion-based list/life-area drag reordering.
- A single centered toast component is the app-wide transient feedback channel.
- Confirmation, prompt, and session dialogs resolve once and close without leaving an empty modal.
- Life-area reorder feedback explains the relationship created by the move.
- The entire application is built using React components (including the top bar, sidebar, pages, overlays, and player). Re-renders patch those surfaces in place, preserving their DOM identity and automatically escaping displayed task/list text.

## 2. Lists and life areas

### List management — Shipped

- Create, edit, rename, reorder, and delete lists.
- Choose an emoji from a curated, paged picker; editing keeps the picker behind the clickable
  list preview so the form stays focused, while the wider form keeps availability details clear.
- Edit List separates list details from availability with a single section divider.
- Deleting a list soft-deletes its tasks and sessions for sync safety.
- Lists display incomplete/done counts, tracked time, and combined estimates.
- Tasks can be dragged between lists and album sections.
- Selecting a task row opens task detail directly; rows omit a redundant overflow-menu trigger.

### Life-area filing — Shipped

- Five fixed areas: Career / Work, Health & Wellbeing, Relationships, Finances, and Recreation.
- Each area has a prominent, color-tinted symbol and larger label for quick scanning; Unsorted
  uses a neutral Inbox. Sidebar list names use the same readable type scale.
- Personal Growth is folded into Health & Wellbeing. Legacy `growth` values from supported older
  clients are accepted and normalized instead of appearing as Unsorted.
- Lists may be left Unsorted.
- A list may count **for** or **against** its area.
- List color is derived from its life area; Unsorted uses neutral gray.
- Sidebar sections are collapsible and remember their UI state locally.
- Dragging a list between life-area sections changes its area and derived color.

### Life-area planning priority — Shipped foundation

- Life areas can be reordered in the sidebar from most to least important.
- The grip appears on hover, while the full life-area header uses the same drag interaction and
  subdued dragging feedback as list rows.
- List rows and life-area headers share the same inline, fixed-width drag-grip styling.
- Priority order is stored in SQLite and synced through Supabase.
- **Known gap:** priority is not yet enforced when starting a task or adding a session.
- Automatic planning uses this priority after deadline order and before task order.

### List availability windows — Shipped foundation

- List create/edit supports multiple weekly availability rows.
- Each row independently selects any combination of Monday through Sunday.
- Each row has start and end times.
- Day controls use explicit pressed buttons, and time edits update immediately while saved
  schedule changes are applied.
- End times earlier than start times mean the following day and show a visible “Next day”
  cue.
- Equal start/end times are rejected as ambiguous.
- Availability is stored in SQLite and synced through Supabase.
- Planner renders availability as quiet candidate-time background rather than claiming it is
  already booked.
- List create/edit names overlapping availability from other lists inline without blocking it;
  overlapping rows inside the same list are rejected as ambiguous.
- **Known gap:** availability does not yet constrain manual task starts or session entry.

## 3. Tasks

### Task management — Shipped

- Create and edit use the same two-column task-detail layout.
- The One-time/Repeating selector uses compact horizontal pills so it does not compete with
  the primary task fields.
- Rename, move, reorder, delete, complete/uncomplete, and group tasks into free-form albums.
- Add or edit notes (“Lyrics”) inline or from the dedicated overlay.
- The Now Playing focus page keeps the current task’s free-form context directly editable and
  pairs it with two glanceable progress surfaces: the current session and the task overall.
  Open sessions use a running clock without an invented percentage; Target sessions fill against
  the configured target; Pomodoro work and break phases fill against their configured block
  lengths. The live clock uses a calm, static tabular readout alongside the mode-appropriate
  progress bar or open-session ruler. One-time task progress uses tracked time against its estimate, while Daily
  repeating-task progress is limited to today when the task is scheduled. Playback remains in the persistent bottom player instead of being
  duplicated, and task editing stays in task detail rather than adding another action here.
- Mark effort as Deep, Shallow, or None.
- Set deterministic impact as Low, Medium, High, or untagged.
- Set impact direction as for/against the list’s life area.
- Move a task to another list from task detail.
- New Task and Edit Task group Repeat with its Deadline or weekday schedule in the right-hand
  planning column, directly above session settings.
- List detail uses a playlist-style hero with cover art, track/completion counts, recorded time,
  life-area direction, a compact availability summary, and a physical tracked-versus-estimated
  time bar. A top-right Edit List icon stays in the hero while Add Task gets its own row directly
  below it; there is no list-wide Play action, and the sidebar no longer carries edit pencils.
- Task lists show Repeating tasks first and One-time tasks below, with blue section labels.
- Completed tasks live in an animated collapsible section.

### One-time tasks — Shipped

- Optional estimate in minutes/hours.
- Optional deadline.
- Optional minimum and maximum useful session size.
- Completion is terminal until manually unchecked.
- Deterministic jewels pay once on completion when an impact tier is set.
- Estimate progress is shown physically as session segments inside a capacity bar.
- Going over estimate remains visible without punitive color or language.

### Repeating tasks — Partially shipped

- Repeat can be set to every day or any selected weekdays, including weekend-only schedules.
- Estimates and deadlines are hidden because they do not describe repeating routines well.
- Repeating rows show today’s session count and tracked time instead of lifetime estimate progress;
  off-day rows state that they are not scheduled today.
- Daily Jam is a quick-glance attention queue grouped by the sidebar's life-area priority. It
  considers positive unfinished tasks that are active, scheduled today, deadline-bearing, or
  impact-tagged, then ranks them by active/scheduled-now state, deadline proximity, today's
  repeating schedule, impact, and least-recent touch. Each card shows at most three unfinished
  tasks with a quiet reason such as a scheduled time, deadline, or impact tier; completed daily
  work leaves the queue but remains represented in today's progress.
- Daily Jam uses three life-area columns on larger windows and two on smaller windows. Cards reuse
  the task-list row with play, session, progress, and deterministic jewel controls.
- The five life-area cards remain visible as a stable map; tasks without a life area appear in an
  additional Unsorted card so older or partially synced data is never hidden.
- Repeating rewards are derived from completed logical-session focus on a scheduled local calendar
  day; pausing an open session does not pay early, and work on an off-day does not create an extra
  scheduled-day reward. No streak or missed-day history is stored.
- **Known gap:** the generic list-row checkbox still writes terminal `completed_at`, while
  Daily Jam and rewards use per-day sessions. Daily check/uncheck needs a dedicated per-day
  completion command so it resets correctly and does not remove the routine permanently.

### Repeating-task schedule windows — Shipped

- Multiple weekly time rows per repeating task.
- Any combination of weekdays per row.
- Existing repeating tasks with no stored windows retain their backward-compatible every-day,
  no-fixed-time behavior; the editor presents this as an explicit Every day mode.
- Day controls use explicit pressed buttons, and time controls remain immediately editable while
  schedule saves are in flight.
- Overnight rows use one occurrence, selected weekday as the starting day, and a “Next day”
  cue.
- Equal start/end times are rejected.
- Repeating-task create/edit blocks overlapping fixed task schedules and names up to three
  conflicting tasks inline. Overnight and week-boundary overlaps are included.
- Stored in SQLite and synced through Supabase.
- Used by Daily Jam visibility, per-day rewards, task status, and schedule notifications.
- Planner renders these windows as fixed repeating blocks without materializing duplicate rows.

### Sessions and history — Shipped

- A session is one intentional work container for one task. Pausing closes and stores only the
  current focus interval; resuming continues the same session in Open, Target, and Pomodoro modes.
- Finish session is the only ordinary action that closes the logical session. While a session is
  open, the player replaces its History shortcut with a point-of-performance Finish control.
- Only one logical session can be open at a time. Starting a different task asks to finish the
  current session first; accepting closes it and starts the selected task.
- Session history groups its stored focus intervals into one entry. Break time is derived from
  the gaps between focus intervals and from the final gap before Finish; focus totals never count
  those breaks.
- Task detail shows each session's date/range plus separate focus and break time. A grouped session
  is deleted as one unit; its task can never be split accidentally across its focus intervals.
- Sessions can be added, edited, and deleted manually. Edit Session starts with the session's
  current list and task; changing the list filters the task selector, and saving can reassign the
  recorded work while recalculating both task rollups. Add/Edit accepts validated 24-hour `HH:mm`
  start and end values on one row beneath the date; an earlier end time is treated as the next day.
  New or edited recorded work cannot overlap another completed or currently active work session;
  the inline error names the conflicting task and time. Adjacent boundaries remain valid. Save,
  Cancel, and backdrop dismissal remain safe through the modal's closing animation.
- Manual add/edit commands recheck recorded and currently active session overlap in Rust while
  holding the local state and database locks, so a stale modal cannot create a local collision.
- Manually recorded work is a finished one-interval logical session. Task-row session counts,
  repeating-day counts, and history counts use logical sessions rather than focus-interval rows.
- Confirmed macOS workspace sleep/wake events pause the current focus interval at the sleep
  timestamp rather than counting computer sleep as work or finishing the logical session. Ordinary
  scheduler delays never pause a task. The pause diagnostic includes the measured sleep interval.
- **Known gap:** sessions created concurrently on devices that have not yet seen each other's
  writes can still meet as overlapping factual records after sync. Cross-device reconciliation is
  an upcoming-release TODO and must not silently delete either record.

### Bounded calendar planner — Shipped

- Today and seven-day views place list availability, repeating windows, deadlines, future plans,
  recorded work, live work, and a current-time line on one physical timeline.
- Planned, recorded-work, and live blocks are offset from the wider availability and
  repeating-time bands, keeping the underlying allocation visible as calm container context. The
  offset is 30% in Today and 20% in the narrower seven-day view; live work retains stronger active
  styling.
- Focus intervals and their derived breaks appear as distinct actual-session blocks. Hovering a
  list-availability, repeating-task, recorded/live-focus, break, or planned-session block
  shows one compact card with a linked title and exact start–end time. The link opens the owning
  list or task, while availability and repeating backgrounds still permit drag selection.
- One-time tasks can be planned with a list-first, filtered task selector plus explicit local date,
  start, and end fields; an earlier end time means the following day. New plans default to a
  non-empty list whose availability contains the selected range when possible. Existing plans can
  be reassigned to another eligible task without changing their time.
- Past calendar days can record completed work for any task directly into actual session history;
  Today exposes both Record and Plan, while future days only expose Plan.
- Recorded-work blocks can be selected to edit their factual date, start, and end time through the
  existing Edit Session form; live work and availability remain read-only.
- Record Session selects a list before a task and only shows tasks from that list, avoiding one
  cross-list task menu. It defaults to the first non-empty list whose availability contains the
  selected time, falling back to the first non-empty ordered list when no availability matches.
- Dragging across empty calendar time creates a 30-minute-snapped visual selection and opens the
  appropriate Record or Plan form with the range prefilled. The time rail labels every hour.
  Crossing the current-time line clamps to that boundary, and the form remains the accessible
  precision fallback. Every new drag opens a fresh form, so list, task, and time choices from the
  previous selection are not carried into the next one.
- Planned sessions can be edited, removed, or started directly. Starting removes the plan and
  uses the normal timer path, so plans never count as recorded work or rewards.
- Future plans persist in additive SQLite storage, sync across signed-in devices with
  last-write-wins tombstones, and survive export/import. Older backups remain importable.
- One-time-task rows show their next plan and provide a quiet planning action at the point of
  performance; task detail provides the same focused Plan action.
- Auto-plan previews a deterministic seven-day allocation without saving it. The pure Rust
  allocator expands local weekly availability, subtracts repeating commitments and existing
  plans, ranks eligible work by deadline, life-area priority, task order, and stable task id, then
  splits remaining estimates into each task's valid session range and fills the earliest opening.
- The bounded preview shows planned-versus-available capacity as a physical bar, lists every
  suggested block, and names unscheduled work factually. Existing plans consume that bar only for
  the portion intersecting usable availability, so outside-availability plans remain context
  without distorting open capacity. Accept persists the entire current preview atomically as
  ordinary planned sessions; a changed calendar requires a fresh preview.
- Home/Daily Jam shows the nearest future planned block, calendar blocks retain direct Start, and
  Planner limits actual-session context to the recent seven days. Detailed history stays in
  Insights.
- Past unstarted plans disappear instead of becoming missed-block or failure history.
- The planner horizon remains bounded and has no rewards, streaks, urgency, or loss framing.
- **Known gap:** external calendar providers are not included.

## 4. Timer and player

### Persistent player — Shipped

- Bottom player shows the active/last task, list, live elapsed time, and task progress.
- Pause preserves the logical session and accumulated focus. Resume continues it; Finish closes it.
- An open session's Finish control occupies the History shortcut position, so closure is available
  where the timer is being used without adding another competing control.
- Its session progress bar is capped at 405px so the central playback state stays compact.
- Live session and break progress interpolate continuously between timer updates, with an instant
  reduced-motion fallback.
- Its workflow icon cycles the timer mode immediately without opening Settings; detailed mode
  lengths remain in Settings.
- Play/pause controls are available from task rows, player, keyboard, and tray. Finish is explicit
  in the player; choosing another task offers a finish-and-start confirmation.
- The bottom player omits a separate Lyrics shortcut; notes remain available from task detail and
  the Now Playing focus page.
- Its workflow and task-history/Finish shortcuts share the same aligned control box. History uses
  the Lucide History icon only when no session is open; an open session uses Circle Stop for Finish.
- Another device’s live task is shown read-only with a “play here” takeover action.
- Timer state continues while the main window is closed.

### Open mode — Shipped

- Stopwatch focus runs until paused or finished; pauses remain inside the same logical session.
- Optional quiet hourly check-in after each full hour of continuous work.
- Check-in has no sound and uses supportive, non-punitive copy.

### Target mode — Shipped

- Configurable target length from 1 to 240 minutes.
- A physical progress bar fills toward the target and pulses when reached.
- One notification fires per logical session at the target, using accumulated focus across pauses.
- Time continues counting after the target instead of forcing a stop.

### Pomodoro mode — Shipped

- Configurable work, short-break, long-break, and cycles-before-long-break lengths.
- Work blocks auto-log when their boundary is reached.
- Manual pause/resume retains both the logical session and progress within the current work block;
  pausing no longer creates a new Pomodoro session or restarts its countdown.
- Work-to-break starts the break automatically and sends a notification without stealing focus.
- Break-to-work starts the next work block automatically and sends another notification without
  forcing the main window forward.
- Separate system sounds for break time and return-to-work.
- Focus music pauses on breaks and resumes with work.
- A session owned by another device never starts or continues focus music on this device.

## 5. Menu-bar tray

### Tray status — Shipped

- Note/check artwork replaces the former play triangle while preserving the original tray
  implementation.
- Idle is white, active work is green, and break/awaiting state is yellow.
- Active title shows the task name and live time; break state includes a coffee marker.
- Tray menu exposes the current task, play/pause/resume, Finish session, focus-music play/pause,
  next track, Open, and Quit. Other recent tasks remain disabled until the open session is
  finished, avoiding a silent task switch.
- Focus-music tray controls work from idle: Play loads and starts music, Pause keeps the tray
  label synchronized, and Next loads an empty queue or advances the current queue. Their event
  listeners remain active across task and music state updates.
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
- When a session is open, its Jump Back In card shows a physical Focus/Break bar with both times;
  the display stays bounded to that current point-of-performance context.
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
- Repeating tasks pay once per scheduled qualifying day/session.
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
- Expandable task/session groups count logical sessions and show separate focus and break totals.
- Day/week timelines render focus intervals and derived breaks distinctly while tracked-time
  aggregates continue to include focus only.

## 10. Focus music

### Audius player — Shipped

- Streams artist-licensed / Creative Commons-compatible tracks from Audius without an API key.
- Eight compact vibes: Noise, Nature, Lo-Fi, Ambient, Coffee House, Game OST, Classical, and
  Energizing.
- Noise is a locally generated, predictable white-noise loop and does not depend on the network.
- Audius-backed vibes combine official genre feeds with focused searches. Nature filters rain,
  river, and wind results to relevant Ambient tracks; Ambient also includes relevant singing-bowl
  tracks; Coffee House combines Acoustic, Jazz, and Downtempo; Game OST combines Soundtrack with
  filtered game-soundtrack results.
- Audius queues deduplicate candidates, reject unavailable/gated/short tracks, prefer
  vibe-appropriate moods, and rank by catalog play count with up to 50 candidates.
- Starts with work, pauses on break/stop, and resumes with work.
- A dedicated Focus Music settings section contains the device-local enable switch. Disabling it
  fades out current music and blocks automatic restarts; enabling it resumes music immediately
  when a local work session is active. The choice persists across restarts without affecting task
  timing or another device. The mini-player contains no separate enable icon.
- Normal starts fade from silence to full app volume over two seconds; normal stops fade back to
  silence over two seconds. These fades do not change the macOS system volume.
- Focus music does not detect, pause for, resume after, or control audio in Apple Music, Spotify,
  browsers, meeting apps, or other external services.
- Play/pause, next, and vibe controls in the app; volume follows the macOS system volume.
- The right-side mini-player is a two-row, text-first control strip. The static ellipsized track
  name and favorite occupy the first row; vibe, play/pause, and next occupy the second. It
  deliberately shows neither an enable icon nor album art, keeping music a quiet utility rather
  than a visual browsing surface. Previous remains available through system media controls.
- A heart control in the mini-player and track detail saves or removes the current song. Saved
  songs persist offline, sync through the signed-in account, and appear on every device in a
  Favorites vibe that replays the queue later in saved order.
- The bottom music player keeps a fixed 20% width; overflowing track titles use a quiet static
  ellipsis, with the full title available through its native hover tooltip.
- macOS media keys and Now Playing controls can play, pause, go to the previous/next track while
  TaskPlayer is unfocused; the system surface shows the current title, artist, and available
  artwork.
- The selected vibe persists locally; legacy Jazz and Electronic selections migrate to Coffee
  House and Energizing respectively.
- Track detail shows artwork, artist, genre, and an Audius link.
- Artwork falls back through decentralized mirror URLs when a node fails.
- Music state is mirrored to the tray for independent tray controls.

## 11. Account and cross-device sync

### Local-first storage — Shipped

- SQLite is the source of truth on each device.
- Ordered, versioned migrations run automatically through `PRAGMA user_version`.
- Lists, tasks, sessions, configuration, run state, life-area priorities, and sync metadata are
  stored locally.
- Session rows remain factual focus intervals and carry an optional logical-session id plus finish
  timestamp. Breaks are derived from interval gaps instead of stored as another entity.
- Deletes are soft tombstones so they can propagate across devices.

### Google sign-in and Supabase sync — Shipped

- Google OAuth through Supabase Auth using PKCE and an app deep-link callback.
- Account avatar/name/email in Settings.
- Incremental push/pull sync approximately every 60 seconds while signed in.
- A single manual Repair data control performs a full account resync when remote data is missing.
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
- Logical-session and run-state fields use the same additive backfill/capability contract; legacy
  session rows remain readable as standalone finished sessions.

### Live session ownership — Shipped

- One active session per account, Spotify-style.
- Remote active sessions mirror read-only on other devices.
- Mirroring a remote session also silences this device's focus music, preventing two devices from
  playing the soundtrack for one work session.
- Playing on another device takes ownership; taking over the same task can continue its current
  focus position, Pomodoro block progress, and logical-session identity.
- Session ownership prevents duplicate timer transitions and most duplicate notifications.

## 12. Settings, data, and maintenance

### Settings albums — Shipped

- Settings uses a two-pane layout with persistent section navigation on the left and the selected
  section's controls on the right; narrow windows stack navigation above the detail pane.
- Account.
- Workflow configuration.
- Workflow cards in Settings are configuration tabs only; the active workflow changes exclusively
  from the player control.
- Notifications.
- Keyboard.
- Data, with a single Repair data action that performs a full account resync.
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

### Shipped planning system

- List availability windows.
- Daily fixed-time windows, including overnight occurrences.
- One-time task estimates, deadlines, and minimum/maximum session sizes.
- Global life-area priority order.
- Schedule-boundary notifications.
- Today and next-seven-days calendar views.
- Manual planned-session blocks, rescheduling, direct Start, and recent actual-session context.
- Deterministic automatic allocation with a read-only preview, physical capacity bar, factual
  infeasibility copy, and explicit atomic acceptance.

### Not shipped yet

- Conflict warnings when a lower-priority area tries to use a higher-priority window.
- External calendar-provider integration.
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
