import {
  esc, fmt, fmtLong, fmtEst, fmtHM, whenLabel, timeAgo, LIFE_AREAS,
  IMPACT_TIERS, IMPACT_TIER_KEYS, jewelPayout, toDateInputValue, dailyPayoutOn, dailyPayoutDayCount,
  RANKS, RANK_AREA_CAP_RATIO,
} from "./utils.js";
import { html, render as litRender } from "../vendor/lit-html.js";
import { animate } from "../vendor/motion.js";
import { ATTENTION_TASKS_SIZE, RECENT_TASKS_SIZE } from "./constants.js";
import { simpleScheduleEditorHtml } from "./weekly-schedule.js";
import { topbar } from "./components/topbar.js";
import { pinnedNav } from "./components/pinned-nav.js";
import { sidebar, sidebarListRow as sidebarListRowComponent, sidebarToggleIcon } from "./components/sidebar.js";
import { taskListPage } from "./components/task-list-page.js";
import { dailyJam } from "./components/daily-jam.js";

export function createRenderer({ state, helpers, actions }) {
  const { list, activeList, findTask, tasksForList, taskSessions, taskTotal, listTotal, listEstimateTotal, targetMs, modeLabel, modeGlyph } = helpers;

  // "12h 15m" -> "12h 15m of 20h" when an estimate total is known, otherwise
  // just the plain time — shared by the artist header, sidebar row, and
  // album sub-line so "spent of estimate" reads the same everywhere.
  const withEst = (timeText, estimateMin) => (estimateMin ? `${timeText} of ${fmtEst(estimateMin)}` : timeText);

  async function animateDisclosure(body, chevron, expanding) {
    if (!body || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const height = body.scrollHeight;
    body.style.overflow = "hidden";
    const animations = [animate(
      body,
      {
        height: expanding ? ["0px", `${height}px`] : [`${height}px`, "0px"],
        opacity: expanding ? [0, 1] : [1, 0],
      },
      { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] },
    )];
    if (chevron) {
      animations.push(animate(
        chevron,
        { transform: expanding ? ["rotate(0deg)", "rotate(90deg)"] : ["rotate(90deg)", "rotate(0deg)"] },
        { duration: 0.45, ease: "easeInOut" },
      ));
    }
    await Promise.all(animations.map((animation) => animation.finished)).catch(() => {});
    body.style.removeProperty("height");
    body.style.removeProperty("opacity");
    body.style.removeProperty("overflow");
    chevron?.style.removeProperty("transform");
  }
  // `api` is the exact object this function returns (built up via
  // Object.assign at the bottom, not a fresh object literal), so that
  // bootstrap.js's later `renderer.actions = dispatchAction` — done after
  // construction, since dispatchAction's own switch statement calls back
  // into `renderer.*` — actually reaches this closure. Capturing the
  // `actions` parameter directly here would freeze `dispatch` on whatever
  // `actions` was AT CONSTRUCTION TIME (always `null`, since bootstrap.js
  // passes `actions: null` and only assigns the real dispatcher afterward),
  // silently turning every rowMenu action and "play first" into a no-op.
  const api = {};
  const dispatch = (action, payload) => (api.actions || actions || (() => undefined))(action, payload);

  // Sidebar-icon convention: 15px, same visual weight as the 14px emoji
  // glyphs beside them, both sitting in the fixed-width `.li-icon` column so
  // every row's icon — Insights and every list — starts at the same x
  // position instead of drifting per row.

  // Feather's "bar-chart-2" glyph — reads as analytics/trends, matching
  // what the Insights page actually is (day/week/month rollups, capacity
  // bars, rulers) rather than a plain list-of-entries icon.
  const INSIGHTS_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;

  // Same bar-chart glyph, sized for the Insights page's 160px `.hdr .cover`
  // tile — an SVG's width/height don't scale with the tile's font-size the
  // way the other pages' text-glyph covers do, so it needs its own size.
  const INSIGHTS_SVG_HERO = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;

  // Same house glyph as the topbar's #tbhome button (index.html), sized to
  // the 15px sidebar-icon-column convention — used as the Home page's own
  // stickybar icon so it reads like the other pages' mini-headers.
  const HOME_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></svg>`;

  // Spotify/Apple-Music-style sticky mini-header — sits above every .hdr
  // as #main's first child (see the 4 page renderers below), always
  // `position:sticky;top:0` (see CSS) but invisible at rest. It only fades
  // in once the big header's own <h1> — the "artist name" — scrolls out of
  // view; initStickyHeader() below is what watches for that.
  const stickyBarHtml = (icon, name) => `
    <div class="stickybar" id="stickybar">
      <span class="sb-icon">${icon}</span>
      <span class="sb-name">${name}</span>
    </div>`;

  // Every page renderer fully replaces #main's innerHTML, which would
  // otherwise orphan any previous IntersectionObserver (still watching a
  // <h1> that no longer exists) and leak a new one on every re-render — so
  // each of the 4 page renderers disconnects the last one via this before
  // wiring up its own #stickybar/h1 pair.
  let stickyObserver = null;
  function initStickyHeader() {
    if (stickyObserver) { stickyObserver.disconnect(); stickyObserver = null; }
    const main = document.getElementById("main");
    const bar = document.getElementById("stickybar");
    const h1 = main?.querySelector(".hdr .info h1");
    if (!main || !bar || !h1) return;
    stickyObserver = new IntersectionObserver(
      ([entry]) => bar.classList.toggle("show", !entry.isIntersecting),
      { root: main, threshold: 0 }
    );
    stickyObserver.observe(h1);
  }

  // Settings lives in the topbar's right-hand icon cluster. Recent/Insights
  // moved back to being pinned rows above "Your Lists" (see
  // `renderPinnedNav`) — this used to hold all three, but only Settings has
  // no natural home in the sidebar (it isn't "content" the way Recent/
  // Insights are). Re-rendered on every `render()` (cheap: 1 button) so the
  // `active` class tracks state.view.
  function renderTopbar() {
    if (!state.S) return;
    const icons = document.getElementById("topbarIcons");
    if (!icons) return;
    litRender(topbar({ activeView: state.view }), icons);
  }

  // Recent/Insights as pinned sidebar rows, sitting above the "Your Lists"
  // heading — same `.list-item` row every real list uses (see
  // `renderSidebar`), just with a neutral outline icon instead of a colored
  // emoji tile, and no count/grip/rename-pencil since neither is a real,
  // reorderable list. Rendered separately from `renderSidebar` (a different
  // DOM node, `#pinnedNav`, that never scrolls with the list rows below it)
  // but on the same cadence — both are cheap, few-row innerHTML rebuilds.
  function renderPinnedNav() {
    if (!state.S) return;
    const nav = document.getElementById("pinnedNav");
    if (!nav) return;
    litRender(pinnedNav({ activeView: state.view }), nav);
  }

  // One list row — count replaces the old two-line "N tasks · spent of
  // estimate" meta text, which moves into the row's title tooltip instead of
  // being always-on. `.list-grip` is positioned absolute (see CSS) precisely
  // so it doesn't reserve flex space and shift list rows' `.li-icon` out of
  // alignment with each other.
  function sidebarListRowForState(listItem, attentionIds) {
    const count = tasksForList(listItem.id).length;
    const liveTask = state.S.run.activeTaskId && state.S.run.phase === "work" && state.S.run.runningStart
      ? findTask(state.S.run.activeTaskId)
      : null;
    const isPlaying = liveTask?.listId === listItem.id;
    const detail = `${isPlaying ? "Recording now · " : ""}${count} task${count === 1 ? "" : "s"} · ${withEst(fmtLong(listTotal(listItem.id)), listEstimateTotal(listItem.id))} — drag to reorder or onto a section`;
    const playingTask = state.view === "playing" ? nowPlayingSelection().task : null;
    const isActive = (state.view === "tasks" && listItem.id === state.activeListId)
      || (state.view === "playing" && playingTask?.listId === listItem.id);
    const attention = tasksForList(listItem.id).some((task) => attentionIds.has(task.id));
    return sidebarListRowComponent({
      listItem,
      detail,
      active: isActive,
      playing: isPlaying,
      attention,
    });
  }

  // Sidebar lists are grouped under their life area (the same tag that feeds
  // the Home radar), Slack-style: each area is a collapsible section header
  // with its lists nested below. This makes the life category the top of the
  // navigation hierarchy (area → list → album → task) without any new data —
  // it reuses the list's existing `lifeArea` tag. Design constraints from
  // Life areas follow the user's persisted planning-priority order. This is
  // a conflict-resolution fact surfaced at the point of planning, while
  // untagged lists stay outside that order in a calm "Unsorted" bucket.
  // Dragging a list onto a header re-files it; dragging a header's grip
  // changes planning precedence.
  //
  // Every LIFE_AREAS entry always renders, even with zero lists — an earlier
  // version hid empty sections outright (an empty "Finances" section reading
  // as a reproach, per rule 9), but that also meant a category you'd never
  // touched was invisible, not just empty, with no way to discover it existed
  // short of the New List dialog's dropdown. The fix keeping rule 9 intact
  // isn't hiding the section — it's making the empty state itself carry zero
  // judgment: the `.ls-invite` row below is a plain "+ Start a list", the
  // same wording and visual weight regardless of *which* category is empty
  // or how long it's been that way, so it reads as a standing option, never
  // a status report on the category.
  function renderSidebar() {
    if (!state.S) return;
    const byArea = new Map();
    for (const listItem of state.S.lists) {
      const key = listItem.lifeArea || "";
      if (!byArea.has(key)) byArea.set(key, []);
      byArea.get(key).push(listItem);
    }
    const rankByArea = new Map((state.S.lifeAreaPriorities || []).map((item) => [item.areaKey, item.priorityRank]));
    const orderedAreas = LIFE_AREAS.map((area, canonicalIndex) => ({ area, canonicalIndex }))
      .sort((a, b) => (rankByArea.get(a.area.key) ?? a.canonicalIndex + 1) - (rankByArea.get(b.area.key) ?? b.canonicalIndex + 1));
    const sections = [];
    for (const [priorityIndex, entry] of orderedAreas.entries()) {
      const area = entry.area;
      const items = byArea.get(area.key) || [];
      sections.push({ key: area.key, dropArea: area.key, label: area.label, color: area.color, items, priorityRank: priorityIndex + 1 });
    }
    const untagged = byArea.get("");
    if (untagged && untagged.length) {
      sections.push({ key: "__unsorted__", dropArea: "", label: "Unsorted", color: "var(--muted)", items: untagged, priorityRank: null });
    }

    const anyCollapsed = sections.some((section) => state.sidebarCollapsed[section.key]);
    const toggleAll = document.getElementById("sidebarToggleAll");
    if (toggleAll) {
      const label = anyCollapsed ? "Expand all list sections" : "Collapse all list sections";
      litRender(sidebarToggleIcon({ anyCollapsed }), toggleAll);
      toggleAll.title = label;
      toggleAll.setAttribute("aria-label", label);
      toggleAll.setAttribute("aria-expanded", String(!anyCollapsed));
    }

    const attentionIds = new Set(attentionTasks().map((task) => task.id));
    litRender(sidebar({
      sections,
      collapsed: state.sidebarCollapsed,
      rowForList: (listItem) => sidebarListRowForState(listItem, attentionIds),
    }), document.getElementById("lists"));
  }

  // Collapse/expand a sidebar life-area section (persisted, see state.js).
  async function toggleAreaSection(key) {
    if (!key) return;
    const expanding = !!state.sidebarCollapsed[key];
    const currentHeader = document.querySelector(`.ls-header[data-area="${key}"]`);
    if (!expanding) await animateDisclosure(currentHeader?.nextElementSibling, currentHeader?.querySelector(".ls-chevron"), false);
    state.sidebarCollapsed[key] = !expanding;
    try { localStorage.setItem("tp.sidebarCollapsed", JSON.stringify(state.sidebarCollapsed)); } catch (e) { /* non-fatal */ }
    renderSidebar();
    if (expanding) {
      const nextHeader = document.querySelector(`.ls-header[data-area="${key}"]`);
      await animateDisclosure(nextHeader?.nextElementSibling, nextHeader?.querySelector(".ls-chevron"), true);
    }
  }

  // One point-of-performance control beside "Your Lists": expand everything
  // when any section is folded; once all are visible, the same control folds
  // them all. This only changes the existing local UI preference.
  async function toggleAllAreaSections() {
    const keys = LIFE_AREAS.map((area) => area.key);
    if (state.S?.lists.some((listItem) => !listItem.lifeArea)) keys.push("__unsorted__");
    const shouldExpand = keys.some((key) => state.sidebarCollapsed[key]);
    const changingKeys = keys.filter((key) => Boolean(state.sidebarCollapsed[key]) === shouldExpand);
    if (!shouldExpand) {
      await Promise.all(changingKeys.map((key) => {
        const header = document.querySelector(`.ls-header[data-area="${key}"]`);
        return animateDisclosure(header?.nextElementSibling, header?.querySelector(".ls-chevron"), false);
      }));
    }
    for (const key of keys) state.sidebarCollapsed[key] = !shouldExpand;
    try { localStorage.setItem("tp.sidebarCollapsed", JSON.stringify(state.sidebarCollapsed)); } catch (e) { /* non-fatal */ }
    renderSidebar();
    if (shouldExpand) {
      await Promise.all(changingKeys.map((key) => {
        const header = document.querySelector(`.ls-header[data-area="${key}"]`);
        return animateDisclosure(header?.nextElementSibling, header?.querySelector(".ls-chevron"), true);
      }));
    }
  }

  // Force a section open (idempotent) — used by keyboard navigation so moving
  // onto a list inside a collapsed section reveals it rather than dead-ending.
  function expandAreaSection(key) {
    if (!key || !state.sidebarCollapsed[key]) return;
    state.sidebarCollapsed[key] = false;
    try { localStorage.setItem("tp.sidebarCollapsed", JSON.stringify(state.sidebarCollapsed)); } catch (e) { /* non-fatal */ }
    renderSidebar();
  }

  // Per-list accent: keyed off `listItem.color`, set directly on #main so
  // the header wash and supporting list surfaces share the list identity.
  // Other pages clear these properties and keep their neutral treatment.
  function setAccent(main, color) {
    main.style.setProperty("--accent", color);
    main.style.setProperty("--accent-soft", `${color}1f`);
    main.style.setProperty("--accent-softer", `${color}29`);
  }
  function clearAccent(main) {
    main.style.removeProperty("--accent");
    main.style.removeProperty("--accent-soft");
    main.style.removeProperty("--accent-softer");
  }

  function nowPlayingSelection() {
    const run = state.S?.run;
    const running = run?.activeTaskId && run.phase ? findTask(run.activeTaskId) : null;
    let task = running || (run?.lastTaskId ? findTask(run.lastTaskId) : null);
    if (!running && task?.completedAt) task = null;
    return { run, running, task, listItem: task ? list(task.listId) : null };
  }

  function currentSessionProgressHtml(task, running, run) {
    const config = state.S.config;
    if (!running) {
      return `<section class="focus-progress-section">
        <div class="focus-section-label">Current session</div>
        <div class="focus-time">Paused</div>
        <div class="focus-progress-note">Resume from the player when you are ready.</div>
      </section>`;
    }

    if (run.phase === "break") {
      const target = (run.longBreak ? config.longBreakMin : config.breakMin) * 60000;
      const elapsed = run.breakStart ? Math.max(0, Date.now() - run.breakStart) : 0;
      const pct = Math.min(100, elapsed / target * 100);
      return `<section class="focus-progress-section">
        <div class="focus-section-label">${run.longBreak ? "Long break" : "Break"}</div>
        <div class="focus-time" role="timer">${fmt(Math.min(elapsed, target))} <span>of ${fmt(target)}</span></div>
        <div class="focus-meter break" role="img" aria-label="${Math.round(pct)}% of break elapsed"><span style="width:${pct}%"></span></div>
        <div class="focus-progress-note">The player keeps the break controls within reach.</div>
      </section>`;
    }

    if (run.phase === "awaiting_break" || run.phase === "awaiting_work") {
      const waitingFor = run.phase === "awaiting_break" ? "Break ready" : "Work ready";
      return `<section class="focus-progress-section">
        <div class="focus-section-label">Current session</div>
        <div class="focus-time">${waitingFor}</div>
        <div class="focus-progress-note">This is a compatibility state from an older client. Continue from the player.</div>
      </section>`;
    }

    const elapsed = run.runningStart ? Math.max(0, Date.now() - run.runningStart) : 0;
    if (config.mode === "open") {
      return `<section class="focus-progress-section">
        <div class="focus-section-label">Open session</div>
        <div class="focus-time" role="timer">${fmt(elapsed)}</div>
        <div class="focus-open-ruler" aria-label="Open session has no time target"><span></span><span></span><span></span><span></span><span></span></div>
        <div class="focus-progress-note">No target · the clock continues with you.</div>
      </section>`;
    }

    const target = (config.mode === "pomodoro" ? config.workMin : config.targetMin) * 60000;
    const pct = Math.min(100, elapsed / target * 100);
    const reached = elapsed >= target;
    const label = config.mode === "pomodoro"
      ? `Pomodoro · cycle ${run.cyclesCompleted + 1} of ${config.cyclesBeforeLongBreak}`
      : "Target session";
    const note = config.mode === "target" && reached
      ? "Target reached · the clock continues."
      : `${Math.round(pct)}% of this ${config.mode === "pomodoro" ? "work block" : "target"}`;
    return `<section class="focus-progress-section">
      <div class="focus-section-label">${label}</div>
      <div class="focus-time" role="timer">${fmt(elapsed)} <span>of ${fmt(target)}</span></div>
      <div class="focus-meter${reached ? " reached" : ""}" role="img" aria-label="${esc(note)}"><span style="width:${pct}%"></span></div>
      <div class="focus-progress-note">${esc(note)}</div>
    </section>`;
  }

  function taskProgressHtml(task, running, run) {
    const now = Date.now();
    const working = !!(running && run.phase === "work" && run.runningStart);
    const sessions = taskSessions(task.id);
    const isDaily = task.cadence === "daily";
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    const relevant = isDaily
      ? sessions.filter((session) => (session.end ?? now) > todayStart)
      : sessions;
    const completedMs = relevant.reduce((sum, session) => {
      const start = isDaily ? Math.max(session.start, todayStart) : session.start;
      return sum + Math.max(0, (session.end ?? now) - start);
    }, 0);
    const liveMs = working ? Math.max(0, now - Math.max(run.runningStart, isDaily ? todayStart : 0)) : 0;
    const total = completedMs + liveMs;
    const count = relevant.length + (working ? 1 : 0);
    const estimate = !isDaily && task.estimateMin ? task.estimateMin * 60000 : null;
    const pct = estimate ? Math.min(100, total / estimate * 100) : null;
    const title = isDaily ? "Today" : "Task progress";
    const time = estimate ? `${fmtHM(total)} <span>of ${fmtEst(task.estimateMin)}</span>` : fmtHM(total);
    return `<section class="focus-progress-section focus-task-progress">
      <div class="focus-section-label">${title}</div>
      <div class="focus-time">${time}</div>
      ${pct === null ? "" : `<div class="focus-meter task" role="img" aria-label="${esc(fmtHM(total))} of ${esc(fmtEst(task.estimateMin))}"><span style="width:${pct}%"></span></div>`}
      <div class="focus-progress-note">${count} session${count === 1 ? "" : "s"}${isDaily ? " today" : " recorded"}</div>
    </section>`;
  }

  function focusProgressHtml(task, running, run) {
    return `${currentSessionProgressHtml(task, running, run)}${taskProgressHtml(task, running, run)}`;
  }

  function nowPlayingStatus(running, run) {
    if (!running) return "Paused";
    if (run.phase === "break") return run.longBreak ? "Long break" : "Break";
    if (run.phase === "work") return "Recording";
    return "Waiting";
  }

  function nowPlayingStatusTone(running, run) {
    if (!running || (run.phase !== "work" && run.phase !== "break")) return "neutral";
    return run.phase === "break" ? "break" : "work";
  }

  function renderPlayingPage() {
    const main = document.getElementById("main");
    const { run, running, task, listItem } = nowPlayingSelection();
    if (!task || !listItem) {
      clearAccent(main);
      main.innerHTML = `<div class="focus-empty"><div class="focus-empty-icon">▤</div><h1>Nothing playing</h1><p>Start a task from its row, then open its title here.</p></div>`;
      return;
    }
    setAccent(main, listItem.color);

    const existing = main.querySelector(`.now-playing-page[data-task-id="${CSS.escape(task.id)}"]`);
    if (existing) {
      existing.querySelector("#focusProgress").innerHTML = focusProgressHtml(task, running, run);
      existing.querySelector("#focusStatus").textContent = nowPlayingStatus(running, run);
      existing.querySelector("#focusStatusDot").className = `focus-status-dot ${nowPlayingStatusTone(running, run)}`;
      existing.querySelector("#focusTaskName").textContent = task.name;
      existing.querySelector("#focusListName").textContent = listItem.name;
      const notes = existing.querySelector(".focus-notes");
      if (document.activeElement !== notes && notes.value !== (task.description || "")) notes.value = task.description || "";
      return;
    }

    main.innerHTML = `<div class="now-playing-page" data-task-id="${esc(task.id)}">
      <section class="focus-context-card">
        <div class="focus-identity">
          <div class="focus-cover" style="--cover:${listItem.color};--cover-soft:${listItem.color}88">${esc(listItem.emoji)}</div>
          <div class="focus-identity-copy">
            <div class="focus-list"><span id="focusListName">${esc(listItem.name)}</span> <span aria-hidden="true">›</span></div>
            <h1 id="focusTaskName">${esc(task.name)}</h1>
            <div class="focus-status"><span id="focusStatusDot" class="focus-status-dot ${nowPlayingStatusTone(running, run)}"></span><span id="focusStatus">${nowPlayingStatus(running, run)}</span></div>
          </div>
        </div>
        <div class="focus-notes-head"><label for="focusNotes">Task context</label><span>Saved when you leave the field</span></div>
        <textarea id="focusNotes" class="focus-notes" data-action="setLyricsInline" data-id="${task.id}" aria-label="Task context" placeholder="Add the goal, where you left off, or useful links…">${esc(task.description || "")}</textarea>
      </section>
      <aside class="focus-progress-card" id="focusProgress">${focusProgressHtml(task, running, run)}</aside>
    </div>`;
  }

  function renderMain() {
    if (!state.S) return;
    const main = document.getElementById("main");
    if (state.view === "home") { clearAccent(main); return renderHomePage(); }
    if (state.view === "settings") { clearAccent(main); return renderSettingsPage(); }
    if (state.view === "insights") { clearAccent(main); return renderInsightsPage(); }
    if (state.view === "playing") return renderPlayingPage();

    const listItem = activeList();
    if (!listItem) {
      clearAccent(main);
      main.innerHTML = `<div class="empty">Create a list to get started.</div>`;
      return;
    }
    setAccent(main, listItem.color);

    // #main is also owned by legacy page renderers. Give Lit a dedicated
    // child host so its cached marker can never outlive or conflict with a
    // Settings/Home/Insights innerHTML replacement.
    let taskPageHost = main.firstElementChild;
    if (!taskPageHost || taskPageHost.dataset.litPage !== "tasks") {
      main.replaceChildren();
      taskPageHost = document.createElement("div");
      taskPageHost.className = "lit-page-root";
      taskPageHost.dataset.litPage = "tasks";
      main.append(taskPageHost);
    }
    litRender(taskListPage({
      state,
      listItem,
      all: tasksForList(listItem.id),
      taskSessions,
      taskTotal,
      listTotal,
      listEstimateTotal,
      attentionTaskIds: new Set(attentionTasks().map((task) => task.id)),
    }), taskPageHost);
    initStickyHeader();
    return;

  }

  function renderPlayer() {
    if (!state.S) return;
    const np = document.getElementById("np");
    const center = document.getElementById("center");
    const run = state.S.run;
    const config = state.S.config;
    const running = run.activeTaskId && run.phase ? findTask(run.activeTaskId) : null;
    let task = running || (run.lastTaskId ? findTask(run.lastTaskId) : null);
    if (!running && task && task.completedAt) task = null;
    const listItem = task ? list(task.listId) : null;
    const badge = html`<button class="mode-btn ${config.mode !== "open" ? "on" : ""}" data-action="cycleMode" title="Session mode: ${modeLabel()} — click to change">${modeGlyph()}</button>`;

    // Cross-device: another of this account's devices currently owns the
    // live session (see docs/session-sync-design.md). Point-of-performance
    // rule — this has to show up right here on the player bar, not tucked
    // into Settings — but it's read-only: no pause/skip controls for a
    // session this device isn't actually running (driving those locally
    // would fight the owning device). The one action offered, "Play here",
    // takes it over — same `play` command any other row's ▶ already sends.
    const mirrored = running && run.deviceId && state.S.deviceId && run.deviceId !== state.S.deviceId;
    if (mirrored) {
      let clockText;
      if (run.phase === "break") {
        const breakLen = (run.longBreak ? config.longBreakMin : config.breakMin) * 60000;
        const rem = run.breakStart ? Math.max(0, breakLen - (Date.now() - run.breakStart)) : breakLen;
        clockText = `☕ ${fmt(rem)}`;
      } else if (run.phase === "work" && run.runningStart) {
        clockText = fmt(Date.now() - run.runningStart);
      } else {
        clockText = "waiting";
      }
      litRender(html`<button class="player-task-link" data-action="openNowPlaying" title="Open Now Playing"><span class="art" style="background:${listItem.color}22;color:${listItem.color}">${listItem.emoji}</span><span class="player-task-copy"><span class="t">${task.name}</span><span class="l">Playing on ${esc(run.deviceName || "another device")}</span></span></button>`, np);
      litRender(html`<div class="controls">${badge}<button class="bigaction" data-action="play" data-id="${task.id}" title="Take over on this device">▶ Play here</button></div>
        <div class="timeline"><span class="clock" id="liveclock" style="color:var(--muted)">${clockText}</span><div class="bar live"><span id="livebar" style="width:40%;animation:pulse 1.6s ease-in-out infinite"></span></div><span class="clock">elsewhere</span></div>`, center);
      return;
    }

    if (!task) {
      litRender(html`<div class="art" style="background:#333">▤</div><div><div class="t" style="color:var(--muted)">Nothing playing</div><div class="l">Press ▶ on a task</div></div>`, np);
      litRender(html`<div class="controls">${badge}<button class="pmain" disabled style="opacity:.4">▶</button></div>
        <div class="timeline"><span class="clock">0:00</span><div class="bar"><span></span></div><span class="clock">—</span></div>`, center);
      return;
    }

    litRender(html`<button class="player-task-link" data-action="openNowPlaying" title="Open Now Playing"><span class="art" style="background:${listItem.color}22;color:${listItem.color}">${listItem.emoji}</span><span class="player-task-copy"><span class="t">${task.name}</span><span class="l">${listItem.name}${running ? "" : " · paused"}</span></span></button>`, np);

    if (!running) {
      const timerTarget = targetMs();
      litRender(html`<div class="controls">${badge}
          <button class="pmain" data-action="play" data-id="${task.id}" title="Resume timer">▶</button>
          <button class="pbtn" data-action="openDetail" data-id="${task.id}" title="History">☰</button>
          ${lyrBtn(task.id)}</div>
        <div class="timeline"><span class="clock">${fmt(taskTotal(task.id))}</span>
          <div class="bar"><span style="width:0"></span></div>
          <span class="clock">${timerTarget ? fmt(timerTarget) : "total"}</span></div>`, center);
      return;
    }

    if (run.phase === "break") {
      const breakLen = run.longBreak ? state.S.config.longBreakMin : state.S.config.breakMin;
      const rem = Math.max(0, breakLen * 60000 - (Date.now() - run.breakStart));
      const pct = 100 - rem / (breakLen * 60000) * 100;
      const brkLabel = run.longBreak ? "☕☕" : "☕";
      litRender(html`<div class="controls">${badge}<button class="pmain" data-action="skipBreak" title="Skip break">⏭</button><button class="stopbtn" data-action="stop">■ End</button>${lyrBtn(task.id)}</div>
        <div class="timeline"><span class="clock" id="liveclock" style="color:var(--blue)">${brkLabel} ${fmt(rem)}</span><div class="bar brk live"><span id="livebar" style="width:${pct}%"></span></div><span class="clock" style="color:var(--blue)">${run.longBreak ? "long break" : "break"}</span></div>
        <div class="phaseline"><span class="dot" style="background:var(--blue)"></span>${run.longBreak ? `long break · cycle ${config.cyclesBeforeLongBreak} of ${config.cyclesBeforeLongBreak}` : "break"}</div>`, center);
      return;
    }

    // Compatibility UI for an `awaiting_break` state synced from an older app
    // version. New Pomodoro cycles enter `break` automatically and never show
    // this button.
    if (run.phase === "awaiting_break") {
      const breakLen = run.longBreak ? state.S.config.longBreakMin : state.S.config.breakMin;
      const btnLabel = run.longBreak ? `Long break ☕☕ — ${breakLen}m` : `Break ☕ — ${breakLen}m`;
      litRender(html`<div class="controls">${badge}<button class="bigaction" data-action="startBreak" title="Start break" style="background:var(--blue)">${btnLabel}</button><button class="stopbtn" data-action="stop">■ End</button>${lyrBtn(task.id)}</div>
        <div class="timeline"><span class="clock" style="color:var(--blue)">Work session done</span><div class="bar brk"><span style="width:100%"></span></div><span class="clock" style="color:var(--blue)">waiting</span></div>`, center);
      return;
    }

    // Compatibility UI for an old synced `awaiting_work` state. New cycles
    // resume work automatically and never show this button.
    if (run.phase === "awaiting_work") {
      litRender(html`<div class="controls">${badge}<button class="bigaction" data-action="resumeWork" title="Start work" style="background:var(--green)">▶ Start work</button><button class="stopbtn" data-action="stop">■ End</button>${lyrBtn(task.id)}</div>
        <div class="timeline"><span class="clock" style="color:var(--green)">Break's over</span><div class="bar"><span style="width:100%"></span></div><span class="clock" style="color:var(--green)">waiting</span></div>`, center);
      return;
    }

    const elapsed = Date.now() - run.runningStart;
    const timerTarget = targetMs();
    const pct = timerTarget ? Math.min(100, elapsed / timerTarget * 100) : 0;
    // Quiet phase/cycle line under the timeline — the same dot-plus-text
    // treatment across all three modes, just with mode-appropriate text:
    // pomodoro shows which cycle you're on (the thing that used to be
    // invisible anywhere in the UI), target shows progress toward the goal,
    // open just says so plainly since there's no target to measure against.
    const phaseText = config.mode === "pomodoro"
      ? `work · cycle ${run.cyclesCompleted + 1} of ${config.cyclesBeforeLongBreak}`
      : config.mode === "target"
        ? `target · ${Math.round(pct)}%`
        : "open · no target";
    const phaseDot = config.mode === "open" ? "#6a6a6a" : "var(--green)";
    litRender(html`<div class="controls">${badge}
        <button class="pmain" data-action="play" data-id="${task.id}" title="Stop &amp; log">⏸</button>
        <button class="pbtn" data-action="openDetail" data-id="${task.id}" title="History">☰</button>
        ${lyrBtn(task.id)}</div>
      <div class="timeline"><span class="clock" id="liveclock">${fmt(elapsed)}</span>
        <div class="bar live ${pct >= 100 ? "done" : ""}"><span id="livebar" style="width:${timerTarget ? pct + "%" : "40%"};${timerTarget ? "" : "animation:pulse 1.6s ease-in-out infinite"}"></span></div>
        <span class="clock">${timerTarget ? fmt(timerTarget) : "rec"}</span></div>
      <div class="phaseline"><span class="dot" style="background:${phaseDot}"></span>${phaseText}</div>`, center);
  }

  function render() {
    if (!state.S) return;
    renderTopbar();
    renderPinnedNav();
    renderSidebar();
    renderMain();
    renderPlayer();
    if (state.openTaskId) renderDetail();
    const navBackButton = document.getElementById("navback");
    const navForwardButton = document.getElementById("navfwd");
    if (navBackButton) navBackButton.disabled = !state.navBack.length;
    if (navForwardButton) navForwardButton.disabled = !state.navFwd.length;
    document.getElementById("tbhome")?.classList.toggle("active", state.view === "home");
  }

  const sameRoute = (a, b) => a.view === b.view && (a.listId || null) === (b.listId || null);

  function capturedRoute() {
    return { ...state.route, scrollTop: document.getElementById("main")?.scrollTop || 0 };
  }

  function applyRoute() {
    state.view = state.route.view;
    if (state.route.view === "tasks" && state.route.listId && list(state.route.listId)) {
      state.activeListId = state.route.listId;
    }
    render();
    const main = document.getElementById("main");
    if (main) main.scrollTop = state.route.scrollTop || 0;
    animatePage();
  }

  function animatePage() {
    const main = document.getElementById("main");
    if (!main || !main.animate) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    main.animate(
      [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
      { duration: 260, easing: "cubic-bezier(.22,.61,.36,1)" }
    );
  }

  function navigate(next) {
    if (sameRoute(next, state.route)) {
      applyRoute();
      return;
    }
    state.navBack.push(capturedRoute());
    state.navFwd.length = 0;
    state.route = { ...next, scrollTop: next.scrollTop || 0 };
    applyRoute();
  }

  function goBack() {
    if (!state.navBack.length) return;
    state.navFwd.push(capturedRoute());
    state.route = state.navBack.pop();
    applyRoute();
  }

  function goForward() {
    if (!state.navFwd.length) return;
    state.navBack.push(capturedRoute());
    state.route = state.navFwd.pop();
    applyRoute();
  }

  function openSettingsPage() {
    navigate({ view: "settings", listId: null });
  }

  function openInsightsPage() {
    navigate({ view: "insights", listId: null });
  }

  function openNowPlaying() {
    const { task } = nowPlayingSelection();
    if (!task) return;
    clearSearch();
    navigate({ view: "playing", listId: null });
  }

  // Lands on the dashboard (see renderHomePage below) — greeting, today's
  // stats, "Jump back in", and a grid of every list — rather than dropping
  // straight back onto whichever task list was last active.
  function goHome() {
    clearSearch();
    navigate({ view: "home", listId: null });
  }

  function clearSearch() {
    const input = document.getElementById("topbarSearch");
    if (input) input.value = "";
    const box = document.getElementById("searchResults");
    if (box) {
      box.classList.remove("show");
      box.innerHTML = "";
    }
  }

  // Live filter over task and list names as you type in the topbar search
  // box — called directly from bootstrap.js's "input" listener on every
  // keystroke, so it writes straight to #searchResults rather than going
  // through the normal state->render() cycle (that would rebuild the input
  // itself and fight the browser over cursor position).
  function performSearch(query) {
    const box = document.getElementById("searchResults");
    if (!box || !state.S) return;
    const q = query.trim().toLowerCase();
    if (!q) {
      box.classList.remove("show");
      box.innerHTML = "";
      return;
    }
    const listMatches = state.S.lists.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 4);
    const taskMatches = state.S.tasks
      .filter((t) => !t.completedAt && t.name.toLowerCase().includes(q))
      .slice(0, 8);
    box.innerHTML = !listMatches.length && !taskMatches.length
      ? `<div class="sr-empty">No matches for "${esc(query)}"</div>`
      : [
          ...listMatches.map((l) => `<div class="sr-item" data-action="searchGoList" data-id="${l.id}"><span>${esc(l.emoji)}</span><span class="sr-name">${esc(l.name)}</span><span class="sr-meta">list</span></div>`),
          ...taskMatches.map((t) => {
            const li = list(t.listId);
            return `<div class="sr-item" data-action="searchGoTask" data-id="${t.id}"><span>${li ? esc(li.emoji) : "•"}</span><span class="sr-name">${esc(t.name)}</span><span class="sr-meta">${li ? esc(li.name) : ""}</span></div>`;
          }),
        ].join("");
    box.classList.add("show");
  }

  function searchGoList(id) {
    clearSearch();
    navigate({ view: "tasks", listId: id });
  }

  function searchGoTask(id) {
    const task = findTask(id);
    clearSearch();
    if (!task) return;
    navigate({ view: "tasks", listId: task.listId });
    openDetail(id);
  }

  async function toggleCompleted() {
    const expanding = !state.completedOpen;
    const currentGroup = document.querySelector(".cgroup");
    if (!expanding) await animateDisclosure(currentGroup?.querySelector(".clist"), currentGroup?.querySelector(".chev"), false);
    state.completedOpen = expanding;
    renderMain();
    if (expanding) {
      const nextGroup = document.querySelector(".cgroup");
      await animateDisclosure(nextGroup?.querySelector(".clist"), nextGroup?.querySelector(".chev"), true);
    }
  }

  function openRowMenu(anchorEl, id) {
    const popmenu = document.getElementById("popmenu");
    const task = findTask(id);
    const active = state.S.run.activeTaskId === id && state.S.run.phase;
    // Session history / rename / move / depth / estimate / impact & areas
    // used to be 6 separate entries here, each opening its own dialog.
    // They're now one screen (the task panel below — same one "Session
    // history" already opened), so "Edit task" is the only door into any of
    // them. Album is intentionally still its own entry — it wasn't part of
    // that consolidation.
    popmenu.innerHTML = `
      <button data-action="rowMenu" data-action-name="done" data-id="${id}">${task && task.completedAt ? "↩&nbsp; Mark as not done" : "✓&nbsp; Mark as done"}</button>
      <button data-action="rowMenu" data-action-name="edit" data-id="${id}">☰&nbsp; Edit task</button>
      <button data-action="rowMenu" data-action-name="toggle" data-id="${id}">${active ? "⏸&nbsp; Stop timer" : "▶&nbsp; Start timer"}</button>
      <div class="sep"></div>
      <button data-action="rowMenu" data-action-name="album" data-id="${id}">💿&nbsp; ${task && task.album ? "Change album (" + esc(task.album) + ")" : "Set album…"}</button>
      <div class="sep"></div>
      <button class="danger" data-action="rowMenu" data-action-name="delete" data-id="${id}">🗑&nbsp; Delete task</button>`;
    popmenu.classList.add("show");
    const rect = anchorEl.getBoundingClientRect();
    const width = popmenu.offsetWidth || 190;
    popmenu.style.left = Math.max(8, rect.right - width) + "px";
    popmenu.style.top = (rect.bottom + 6) + "px";
  }

  function closeRowMenu() {
    document.getElementById("popmenu").classList.remove("show");
  }

  function rowMenu(action, id) {
    closeRowMenu();
    if (action === "done") dispatch("toggleDone", { id });
    else if (action === "edit") openDetail(id);
    else if (action === "toggle") dispatch("play", { id });
    else if (action === "album") dispatch("setAlbum", { id });
    else if (action === "delete") dispatch("deleteTask", { id });
  }

  function openDetail(id) {
    state.openTaskId = id;
    document.getElementById("overlay").classList.add("show");
    renderDetail();
  }

  function openCreateDetail() {
    if (!state.S || !state.activeListId) return;
    state.openTaskId = null;
    document.getElementById("overlay").classList.add("show");
    renderCreateDetail();
    document.getElementById("taskNameIn")?.focus();
  }

  function closeDetail() {
    state.openTaskId = null;
    document.getElementById("overlay").classList.remove("show");
  }

  // The task-detail modal's "Impact" section: a tier dial + a for/against
  // toggle, nothing else. This used to also carry a per-task multi-area
  // weighted split (add/remove area chips, a slider per area) — cut, along
  // with mana/vitality/rank, because it was more machinery than the one
  // idea underneath it was worth. A task's area is just whatever life area
  // its list is already tagged with (see "Edit list"); this section only
  // sets how much this task counts, and which direction. Every control
  // commits immediately (tier click, sign toggle) via its own small command
  // — no separate Save step and no local "draft" state, since this panel
  // re-renders from scratch on every state-changed event.
  function renderImpactSection(task) {
    // Each pill shows its own weight (·1/·2/·4) directly, not just the
    // tier name — so what a tier is actually worth is visible before you've
    // picked one, instead of only appearing in the payout-preview line
    // below once a tier is already selected.
    const tierHtml = IMPACT_TIER_KEYS.map((key) =>
      `<button type="button" class="impact-notch${key === task.impactTier ? " sel" : ""}" data-action="setImpactTier" data-id="${task.id}" data-tier="${key}">${IMPACT_TIERS[key].label}<small>${IMPACT_TIERS[key].weight}</small></button>`
    ).join("");

    if (!task.impactTier) {
      return `
        <h4>Impact</h4>
        <div class="impact-section">
          <div class="impact-dial">${tierHtml}</div>
          <div class="payout-preview muted">Pick a tier to start earning jewels for this task.</div>
        </div>`;
    }

    const sign = task.impactSign === -1 ? -1 : 1;
    const listItem = list(task.listId);
    // Used to also print a "List default: increases this area" hint here —
    // it explained where the sign's default came from back when the list
    // was buried behind a "Change" dialog and you couldn't otherwise see
    // it. Now that the list itself sits right in the header (see
    // renderDetail), repeating the word "list" again down here just reads
    // as a second, confusing list field — cut instead of reworded.
    const signHtml = `<div class="sign-group">
      <div class="sign-toggle">
        <button type="button" class="sign-btn${sign === 1 ? " sel" : ""}" data-action="setImpactSign" data-id="${task.id}" data-sign="1">For</button>
        <button type="button" class="sign-btn${sign === -1 ? " sel neg" : ""}" data-action="setImpactSign" data-id="${task.id}" data-sign="-1">Against</button>
      </div>
    </div>`;

    const payout = jewelPayout(task);
    const area = listItem && listItem.lifeArea ? LIFE_AREAS.find((a) => a.key === listItem.lifeArea) : null;
    // Same jewel-sign glyph as the task row (see its comment on why color
    // alone — red vs. an area color like Relationships' #e8115b — isn't
    // reliable) so a negative payout reads the same everywhere it appears.
    const dotsHtml = `${payout.amount < 0 ? `<span class="jewel-sign">−</span>` : ""}${Array.from({ length: Math.abs(payout.amount) }, () =>
      `<i class="jewel-dot${payout.amount < 0 ? " neg" : ""}"${payout.amount > 0 && area ? ` style="background:${area.color}"` : ""}></i>`
    ).join("")}`;
    // Cadence changes when this fires, never the amount: a one-time task
    // pays once, on completion; a "daily" task pays this same fixed amount
    // once per qualifying day instead (see dailyPayoutOn/dailyPayoutDayCount
    // in utils.js) — no escalation, no streak bonus, every day worth exactly
    // the same as the first.
    const earnsLabel = task.cadence === "daily" ? "Earns for today's session" : "Earns on completion";
    const payoutHtml = `<div class="payout-preview">${earnsLabel}: <span class="amt">${dotsHtml}<b>${payout.amount > 0 ? "+" : ""}${payout.amount}</b>${area ? " " + esc(area.label) : ""}</span></div>`;

    return `
      <h4>Impact</h4>
      <div class="impact-section">
        <div class="impact-dial">${tierHtml}</div>
        ${signHtml}
        ${payoutHtml}
      </div>`;
  }

  // This modal is scoped to one job now: change this task's values. Starting
  // or stopping the timer, the running total, and the estimate-vs-progress
  // bar all used to live here too, but that's a live-tracking concern with
  // its own point of performance already — the row's own play button, the
  // Now Playing page — not something this panel needs to duplicate. What's
  // left is every field that's actually a *value*: depth, impact, list,
  // sessions (including the estimate, since a target time is just another
  // stored number, not a live thing), and notes. Every one of them commits
  // the instant you change it — no Save button anywhere in this modal —
  // matching the immediate-commit contract renderImpactSection already
  // established for tier/sign.
  //
  // Plain inline SVG, not an icon font — the app doesn't load one (see
  // LYRIC_ICON below for the existing precedent of this same approach).
  // `currentColor` means each icon automatically follows its button's own
  // text color, including the depth pills' selected/hover states, without
  // any separate color rule per icon.
  const DETAIL_PENCIL_ICON = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
  const DEPTH_ICONS = {
    deep: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>`,
    shallow: `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>`,
    none: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"><circle cx="12" cy="12" r="8"/></svg>`,
  };
  // Cadence's own two-state icon set — a single filled dot for "once," a
  // repeat/loop glyph for "daily" — kept separate from DEPTH_ICONS since
  // these two controls encode unrelated ideas (focus type vs. recurrence)
  // even though they share the same segmented-control markup.
  const CADENCE_ICONS = {
    once: `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>`,
    daily: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2.1 21 6l-4 3.9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 21.9 3 18l4-3.9"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  };

  function renderCreateDetail() {
    const listItem = list(state.activeListId);
    if (!listItem) return closeDetail();
    const impactTiers = IMPACT_TIER_KEYS.map((key) =>
      `<button type="button" class="impact-notch" data-action="setCreateTaskChoice" data-choice-field="ImpactTier" data-choice-value="${key}">${IMPACT_TIERS[key].label}<small>${IMPACT_TIERS[key].weight}</small></button>`
    ).join("");
    const listOptions = state.S.lists.map((item) =>
      `<option value="${item.id}" ${item.id === state.activeListId ? "selected" : ""}>${esc(item.emoji)} ${esc(item.name)}</option>`
    ).join("");
    const modal = document.getElementById("modal");
    modal.classList.add("task-detail-two-column");
    modal.innerHTML = `
      <div class="top"><div class="art" style="background:linear-gradient(135deg,${listItem.color},${listItem.color}55)">${listItem.emoji}</div>
        <div><h2>New task</h2><div class="m">${esc(listItem.name)}</div></div>
        <button class="close" data-action="closeDetail">×</button></div>
      <div class="body">
        <div class="task-detail-grid">
          <div class="task-detail-column task-detail-primary">
            <h4>Name</h4>
            <input class="detail-name-input" id="taskNameIn" placeholder="Task name" autocomplete="off" autocorrect="off" spellcheck="false">
            <h4 class="lyr-h">♪ Notes</h4>
            <textarea class="lyrics-inline" id="taskNotesIn" placeholder="What will finishing this feel like? Add the goal, a note, a link…" rows="3"></textarea>
            <h4>Effort</h4>
            <input type="hidden" id="taskDepthIn" value="">
            <span class="depth-seg" data-choice-group="depth">
              <button type="button" data-action="setCreateTaskChoice" data-choice-field="Depth" data-choice-value="deep">${DEPTH_ICONS.deep}<span>Deep</span></button>
              <button type="button" data-action="setCreateTaskChoice" data-choice-field="Depth" data-choice-value="shallow">${DEPTH_ICONS.shallow}<span>Shallow</span></button>
              <button type="button" class="sel" data-action="setCreateTaskChoice" data-choice-field="Depth" data-choice-value="">${DEPTH_ICONS.none}<span>None</span></button>
            </span>
            <div class="depth-hint" id="taskDepthHint">Not classified.</div>
            <h4>Repeat</h4>
            <input type="hidden" id="taskCadenceIn" value="">
            <span class="depth-seg cadence-seg" data-choice-group="cadence">
              <button type="button" class="sel" data-action="setCreateTaskChoice" data-choice-field="Cadence" data-choice-value="">${CADENCE_ICONS.once}<span>One-time</span></button>
              <button type="button" data-action="setCreateTaskChoice" data-choice-field="Cadence" data-choice-value="daily">${CADENCE_ICONS.daily}<span>Daily</span></button>
            </span>
            <div class="depth-hint" id="taskCadenceHint">Finishes once. Its jewel pays on completion.</div>
            <div id="newTaskDeadlineFields">
              <h4>Deadline</h4>
              <input class="deadline-input" type="date" id="taskDeadlineIn">
            </div>
            <h4>Impact</h4>
            <input type="hidden" id="taskImpactTierIn" value="">
            <input type="hidden" id="taskImpactSignIn" value="${listItem.lifeDirection === "decrease" ? -1 : 1}" data-explicit="false">
            <div class="impact-section">
              <div class="impact-dial" data-choice-group="impact-tier">${impactTiers}</div>
              <div class="sign-group hidden" id="newTaskImpactSign">
                <div class="sign-toggle" data-choice-group="impact-sign">
                  <button type="button" class="sign-btn ${listItem.lifeDirection !== "decrease" ? "sel" : ""}" data-action="setCreateTaskChoice" data-choice-field="ImpactSign" data-choice-value="1">For</button>
                  <button type="button" class="sign-btn ${listItem.lifeDirection === "decrease" ? "sel neg" : ""}" data-action="setCreateTaskChoice" data-choice-field="ImpactSign" data-choice-value="-1">Against</button>
                </div>
              </div>
              <div class="payout-preview muted">Choose an impact tier to set the disclosed jewel reward.</div>
            </div>
            <h4>List</h4>
            <div class="list-select-wrap">
              <select class="list-select" id="taskListIn">${listOptions}</select>
              <svg class="list-select-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
          <div class="task-detail-column task-detail-sessions">
            <div id="newTaskOnceFields">
              <h4>Session size</h4>
              <div class="session-range-row">
                <label><span>Shortest</span><input type="number" id="taskMinSessionIn" min="1" max="1440" placeholder="30"> min</label>
                <span class="range-sep">to</span>
                <label><span>Longest</span><input type="number" id="taskMaxSessionIn" min="1" max="1440" placeholder="90"> min</label>
              </div>
              <div class="depth-hint">The planner splits this task into blocks inside this range.</div>
            </div>
            <div id="newTaskDailyFields" class="hidden">
              <h4>Daily time</h4>
              <div class="detail-weekly-editor">${simpleScheduleEditorHtml("newTaskDailyWindows", [])}</div>
              <div class="depth-hint">Optional. Each window becomes a fixed daily occurrence on that weekday.</div>
            </div>
            <div class="sh"><h4>Sessions</h4></div>
            <div class="det-total" id="newTaskEstimateFields">0m <span class="of">of</span> <input class="est-inline" type="number" id="taskEstIn" min="0.25" max="1000" step="0.25" value="0.5">h <span class="dot">·</span> 0 sessions</div>
            <div class="det-total hidden" id="newTaskDailySessionSummary">0m <span class="dot">·</span> 0 sessions</div>
            <div class="entry"><span class="when">No sessions logged yet</span><span class="dur">—</span></div>
          </div>
        </div>
        <div class="schedule-error task-detail-error" id="taskCreateError"></div>
      </div>
      <div class="foot"><button class="stopbtn" data-action="closeDetail">Cancel</button><button class="create-task-btn" data-action="createTaskFromDetail">Create task</button></div>`;
  }

  function renderDetail() {
    if (!state.S) return;
    const task = findTask(state.openTaskId);
    if (!task) {
      closeDetail();
      return;
    }
    const listItem = list(task.listId) || {
      id: task.listId,
      name: "Unsorted",
      emoji: "•",
      color: "#6b6b6b",
      lifeArea: null,
    };
    const active = state.S.run.activeTaskId === task.id && state.S.run.phase;
    const working = active && state.S.run.phase === "work" && state.S.run.runningStart;
    let entries = taskSessions(task.id).map((entry) => ({ id: entry.id, start: entry.start, end: entry.end }));
    if (working) entries.push({ start: state.S.run.runningStart, end: null, live: true });
    entries.sort((a, b) => b.start - a.start);
    const now = Date.now();
    const rows = entries.length ? entries.map((entry) => `<div class="entry ${entry.live ? "live" : ""}"><span class="when">${whenLabel(entry.start)}${entry.live ? " · recording…" : ""}</span><span class="dur">${fmt((entry.end ?? now) - entry.start)}</span>${entry.live ? `<span class="entry-del"></span>` : `<button class="entry-edit" title="Edit session" data-action="editSession" data-id="${entry.id}">✎</button><button class="entry-del" title="Remove session" data-action="deleteSession" data-id="${entry.id}">×</button>`}</div>`).join("")
      : `<div class="entry"><span class="when">No sessions logged yet</span><span class="dur">—</span></div>`;
    const sessionCount = taskSessions(task.id).length + (working ? 1 : 0);

    // Depth toggle is inline and immediate (click = commit, no dialog) —
    // depth specifically has only 3 fixed states, so a segmented control
    // reads faster here than round-tripping through a confirm dialog for a
    // single click. The caption underneath exists because "Deep/Shallow/
    // None" alone reads as jargon at a glance — it has no functional effect
    // anywhere else in the app, so the one job this control has is to be
    // understood, and a one-line description does that without needing an
    // icon set or a rename that would break the existing badge elsewhere.
    const depthCaption = task.depth === "deep" ? "Long, focused, hard to interrupt."
      : task.depth === "shallow" ? "Quick, low-focus busywork."
      : "Not classified.";
    const depthSegHtml = `<span class="depth-seg" data-id="${task.id}">
      <button class="${task.depth === "deep" ? "sel" : ""}" data-action="setDepth" data-id="${task.id}" data-depth="deep" data-stop-propagation="true">${DEPTH_ICONS.deep}<span>Deep</span></button>
      <button class="${task.depth === "shallow" ? "sel" : ""}" data-action="setDepth" data-id="${task.id}" data-depth="shallow" data-stop-propagation="true">${DEPTH_ICONS.shallow}<span>Shallow</span></button>
      <button class="${!task.depth ? "sel" : ""}" data-action="setDepth" data-id="${task.id}" data-depth="" data-stop-propagation="true">${DEPTH_ICONS.none}<span>None</span></button>
    </span>
    <div class="depth-hint">${depthCaption}</div>`;

    // Cadence toggle — same inline, immediate-commit, exact-state (not a
    // toggle) shape as Depth right above it. Only two states on purpose:
    // "daily" is the one recurring rhythm this app supports (see
    // Task::cadence's doc comment) — no custom weekday picker, no interval
    // field, same "don't build more machinery than the one idea is worth"
    // call already made for impact_tier/deadline_at. The caption spells out
    // the mechanic difference (when the jewel fires) up front rather than
    // leaving it implicit, and deliberately promises "no streak kept" right
    // here — the one place someone would think to ask.
    const cadenceCaption = task.cadence === "daily"
      ? "Repeats every day. No finish line, no streak kept — today's jewel is the same size every day."
      : "Finishes once. Its jewel (if tagged) pays on completion.";
    const cadenceSegHtml = `<span class="depth-seg cadence-seg" data-id="${task.id}">
      <button class="${!task.cadence ? "sel" : ""}" data-action="setCadence" data-id="${task.id}" data-cadence="" data-stop-propagation="true">${CADENCE_ICONS.once}<span>One-time</span></button>
      <button class="${task.cadence === "daily" ? "sel" : ""}" data-action="setCadence" data-id="${task.id}" data-cadence="daily" data-stop-propagation="true">${CADENCE_ICONS.daily}<span>Daily</span></button>
    </span>
    <div class="depth-hint">${cadenceCaption}</div>`;

    const plannerPrimaryHtml = task.cadence === "daily"
      ? ""
      : `<h4>Deadline</h4>
        <input class="deadline-input" type="date" value="${task.deadlineAt ? toDateInputValue(task.deadlineAt) : ""}" data-action="setDeadlineInline" data-id="${task.id}">`;
    const plannerSessionHtml = task.cadence === "daily"
      ? `<h4>Daily time</h4>
        <div class="detail-weekly-editor">
          ${simpleScheduleEditorHtml(`taskDailyWindows-${task.id}`, task.dailyWindows || [], {
            taskId: task.id,
            changeAction: "setDailySchedule",
            addAction: "addDailyScheduleRow",
            removeAction: "removeDailyScheduleRow",
          })}
          <div class="schedule-error" id="taskDailyScheduleError"></div>
        </div>
        <div class="depth-hint">Optional. Each window becomes a fixed daily occurrence on that weekday.</div>`
      : `<h4>Session size</h4>
        <div class="session-range-row">
          <label><span>Shortest</span><input type="number" min="1" max="1440" placeholder="—" value="${task.minSessionMin || ""}" data-action="setSessionRangeField" data-id="${task.id}" data-range-field="min"> min</label>
          <span class="range-sep">to</span>
          <label><span>Longest</span><input type="number" min="1" max="1440" placeholder="—" value="${task.maxSessionMin || ""}" data-action="setSessionRangeField" data-id="${task.id}" data-range-field="max"> min</label>
        </div>
        <div class="depth-hint">The planner splits this task into blocks inside this range.</div>`;

    // The list name is the dropdown itself now — picking a different list
    // commits on change (moveTaskInline), same immediate-commit contract as
    // depth/impact, instead of a "Change" button opening its own dialog just
    // to hold one <select>. Now its own section like Depth, it's styled as
    // a filled chip (matches Depth's pill background) rather than the
    // plain-text-until-hovered look it had tucked into the header.
    const listSelectHtml = `<div class="list-select-wrap">
      <select class="list-select" data-action="moveTaskInline" data-id="${task.id}">
        ${state.S.lists.map((l) => `<option value="${l.id}" ${l.id === task.listId ? "selected" : ""}>${l.emoji} ${esc(l.name)}</option>`).join("")}
      </select>
      <svg class="list-select-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>`;

    // Total + estimate share one line rather than the old standalone hero
    // number — the estimate is just the target this total is measured
    // against, and folding it in here means it's still an editable value
    // (the "5h" itself is the input, committing on change) without resurrecting
    // a dedicated timer-style display.
    const estimateValue = task.estimateMin ? parseFloat((task.estimateMin / 60).toFixed(2)) : "";
    const sessTotalHtml = task.cadence === "daily"
      ? `<div class="det-total">${fmt(taskTotal(task.id))} <span class="dot">·</span> ${sessionCount} session${sessionCount === 1 ? "" : "s"}</div>`
      : `<div class="det-total">${fmt(taskTotal(task.id))} <span class="of">of</span> <button class="est-step" data-action="decreaseEstimate" data-id="${task.id}" title="Decrease estimate by 1h">−</button><input class="est-inline" type="number" min="0" max="1000" step="0.25" placeholder="—" value="${estimateValue}" data-action="setEstimateInline" data-id="${task.id}"><button class="est-step" data-action="bumpEstimate" data-id="${task.id}" title="Increase estimate by 1h">+</button>h <span class="dot">·</span> ${sessionCount} session${sessionCount === 1 ? "" : "s"}</div>`;

    const modal = document.getElementById("modal");
    modal.classList.add("task-detail-two-column");
    modal.innerHTML = `
      <div class="top"><div class="art" style="background:linear-gradient(135deg,${listItem.color},${listItem.color}55)">${listItem.emoji}</div>
        <div><h2><span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true" title="Go to ${esc(listItem.name)}">${esc(task.name)}</span> <button class="editbtn" title="Rename" data-action="renameTask" data-id="${task.id}">${DETAIL_PENCIL_ICON}</button></h2>
        </div>
        <button class="close" data-action="closeDetail">×</button></div>
      <div class="body">
        <div class="task-detail-grid">
          <div class="task-detail-column task-detail-primary">
            <h4 class="lyr-h">♪ Notes</h4>
            <textarea class="lyrics-inline" data-action="setLyricsInline" data-id="${task.id}" placeholder="What will finishing this feel like? Add the goal, a note, a link…" rows="3">${esc(task.description || "")}</textarea>
            <h4>Effort</h4>
            ${depthSegHtml}
            <h4>Repeat</h4>
            ${cadenceSegHtml}
            ${plannerPrimaryHtml}
            ${renderImpactSection(task)}
            <h4>List</h4>
            ${listSelectHtml}
          </div>
          <div class="task-detail-column task-detail-sessions">
            ${plannerSessionHtml}
            <div class="sh"><h4>Sessions</h4><button class="linkbtn blue" data-action="addSession" data-id="${task.id}">＋ Add session</button></div>
            ${sessTotalHtml}
            ${rows}
          </div>
        </div>
      </div>
      <div class="foot"><button class="danger" data-action="deleteTask" data-id="${task.id}">Delete task</button><button class="stopbtn" data-action="closeDetail">Save</button></div>`;
  }

  const LYRIC_ICON = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h11M5 12h9M5 17h13"/><circle cx="19.6" cy="16" r="2.1" fill="currentColor" stroke="none"/><path d="M21.7 15.7V9.4"/></svg>`;
  const lyrBtn = (id) => html`<button class="pbtn lyrbtn" title="Lyrics" data-action="openLyrics" data-id="${id}">${LYRIC_ICON}</button>`;

  function openLyrics(id) {
    state.lyricsId = id;
    document.getElementById("lyroverlay").classList.add("show");
    renderLyrics();
  }

  function closeLyrics() {
    document.getElementById("lyroverlay").classList.remove("show");
    state.lyricsId = null;
  }

  function renderLyrics() {
    const task = findTask(state.lyricsId);
    if (!task) {
      closeLyrics();
      return;
    }
    const listItem = list(task.listId);
    const description = (task.description || "").trim();
    const body = description
      ? description.split(/\n{2,}/).map((paragraph) => `<p>${esc(paragraph).replace(/\n/g, "<br>")}</p>`).join("")
      : `<p class="dim">What will finishing this feel like? Add a note, the goal, or a link.</p>`;
    document.getElementById("lyrmodal").innerHTML = `
      <div class="lyr-hd">
        <span class="lyr-lab">♪ Lyrics · ${listItem ? `<span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true" title="Go to ${esc(listItem.name)}">${esc(task.name)}</span>` : esc(task.name)}</span>
        <button class="lyr-ed" data-action="editLyrics" data-id="${task.id}">${description ? "Edit" : "＋ Add"}</button>
        <button class="lyr-x" data-action="closeLyrics">×</button>
      </div>
      <div class="lyr-body">${body}</div>`;
  }

  function accountSectionHtml() {
    const account = state.S.account;
    if (!account) {
      return `<p class="hint" style="margin-top:0">Sign in with Google to sync your tasks and sessions across devices.</p>
        <div class="setrow"><button class="pill" data-action="signInGoogle">Sign in with Google</button></div>`;
    }
    const avatar = account.avatarUrl
      ? `<img class="acct-avatar" src="${esc(account.avatarUrl)}" alt="">`
      : `<div class="acct-avatar acct-avatar-fallback">${esc((account.name || account.email || "?")[0].toUpperCase())}</div>`;
    const syncFailed = !state.S.syncing && !!state.S.lastSyncError;
    const syncLabel = state.S.syncing
      ? "Syncing…"
      : syncFailed
        ? `Sync failed: ${esc(state.S.lastSyncError)}`
        : state.S.lastSyncedAt
          ? `Synced ${whenLabel(state.S.lastSyncedAt)}`
          : "Not synced yet";
    return `<div class="acct-row">
        ${avatar}
        <div class="acct-info"><strong>${esc(account.name || account.email)}</strong><small>${esc(account.email)}</small></div>
      </div>
      <div class="setrow">
        <button class="pill" data-action="signOut">Sign out</button>
        <button class="pill" data-action="syncNow" ${state.S.syncing ? "disabled" : ""}>${state.S.syncing ? "⟳ Syncing…" : "⟳ Sync now"}</button>
        <button class="pill" data-action="fullSync" ${state.S.syncing ? "disabled" : ""} title="Re-checks every list, task, and session against your account instead of just what's changed recently — use this if something synced on another device isn't showing up here">${state.S.syncing ? "⟳ Syncing…" : "⟳ Full sync"}</button>
      </div>
      <p class="hint${syncFailed ? " hint-error" : ""}">${syncLabel}</p>`;
  }

  // Two independent sound pickers — one for the "work done, break time" alert,
  // one for "break's over, back to work" — so the two are tellable apart by
  // ear alone, without needing to look at the screen. Options come from
  // state.soundOptions (fetched once at startup from the `sound_options`
  // command — see main.js) rather than a hardcoded list here, so this can
  // never list a name the backend wouldn't accept.
  function soundPickersHtml(config) {
    const options = state.soundOptions.length ? state.soundOptions : [config.breakSound, config.workSound];
    const optionsHtml = (selected) =>
      options.map((name) => `<option value="${esc(name)}" ${name === selected ? "selected" : ""}>${esc(name)}</option>`).join("");
    return `<h4>Alert sounds</h4>
      <div class="fld"><label style="min-width:110px">Break time</label><select data-action="setConfigSound" data-key="breakSound">${optionsHtml(config.breakSound)}</select></div>
      <div class="fld"><label style="min-width:110px">Back to work</label><select data-action="setConfigSound" data-key="workSound">${optionsHtml(config.workSound)}</select></div>
      <p class="hint">Played alongside the notification when a work block or break finishes.</p>`;
  }

  // Notifications section body for the Settings page's Notifications album.
  // Every mode fires notifications now (see the tick loop in main.rs), but
  // each mode's are different, so the section body follows the mode picked
  // in Workflow above: Pomodoro gets the work/break sound pickers, Open gets
  // the hourly check-in toggle, Target gets a note about the target-reached
  // alert (no knobs — it fires exactly once, reusing the break sound).
  function notificationsSectionHtml() {
    const config = state.S.config;
    if (config.mode === "open") {
      return `<h4>Hourly check-in</h4>
        <div class="fld"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" data-action="setConfigField" data-key="hourlyNudge" ${config.hourlyNudge ? "checked" : ""}> Check in every hour I keep going</label></div>
        <p class="hint">Each full hour of continuous work: a quiet note that you're doing great, with a nudge to stretch or grab water. No sound.</p>${notifHintHtml()}`;
    }
    if (config.mode === "target") {
      return `<p class="hint" style="margin-top:0">When you reach your target length you'll get a notification saying the session's complete — the clock keeps counting if you stay on. It plays the "Break time" sound; work/break sound pickers apply to 🍅 Pomodoro mode.</p>${notifHintHtml()}`;
    }
    return `${soundPickersHtml(config)}${notifHintHtml()}`;
  }

  // macOS notifications default to "Banners", which disappear on their own
  // after a few seconds — easy to miss if you're not looking at the screen
  // right when a work/break boundary hits. Only the user can switch TaskPlayer
  // to "Alerts" (stays until dismissed); there's no API for the app to do it
  // or even read the current setting. This just points them at the right
  // System Settings pane.
  function notifHintHtml() {
    return `<div class="fld" style="align-items:flex-start;gap:10px;margin-top:10px;padding:10px;border-radius:8px;background:rgba(255,255,255,.04)">
      <div style="flex:1">
        <p class="hint" style="margin:0 0 8px">Notifications disappear on their own by default. For reminders that stay put until you dismiss them, set TaskPlayer's Alert style to <strong>Alerts</strong> in System Settings → Notifications.</p>
        <div class="setrow">
          <button class="pill" data-action="openNotificationSettings">Open Notification Settings</button>
        </div>
      </div>
    </div>`;
  }

  function sessionControlsHtml() {
    const config = state.S.config;
    return `
      <div class="modes">
        <button class="modebtn ${config.mode === "open" ? "sel" : ""}" data-action="setMode" data-value="open">∞ Open<small>Track time</small></button>
        <button class="modebtn ${config.mode === "target" ? "sel" : ""}" data-action="setMode" data-value="target">🎯 Target<small>Aim for a length</small></button>
        <button class="modebtn ${config.mode === "pomodoro" ? "sel" : ""}" data-action="setMode" data-value="pomodoro">🍅 Pomodoro<small>Work / break</small></button>
      </div>
      ${config.mode === "target" ? `<h4>Target length</h4><div class="fld"><input type="number" min="1" max="240" value="${config.targetMin}" data-action="setConfigField" data-key="targetMin"> minutes</div><p class="hint">The bar fills toward your target and pulses when reached — you'll also get a notification. It keeps counting if you go over.</p>` : ""}
      ${config.mode === "pomodoro" ? `<h4>Work / break lengths</h4><div class="fld"><input type="number" min="1" max="120" value="${config.workMin}" data-action="setConfigField" data-key="workMin"> min work</div><div class="fld"><input type="number" min="1" max="60" value="${config.breakMin}" data-action="setConfigField" data-key="breakMin"> min break</div><p class="hint">Work blocks auto-log; music pauses on breaks and resumes on work. Classic is 25 / 5.</p>
        <h4>Long break</h4><div class="fld"><input type="number" min="1" max="12" value="${config.cyclesBeforeLongBreak}" data-action="setConfigField" data-key="cyclesBeforeLongBreak"> cycles before a long break</div><div class="fld"><input type="number" min="1" max="60" value="${config.longBreakMin}" data-action="setConfigField" data-key="longBreakMin"> min long break</div><p class="hint">Every Nth break is longer, so a full set of work blocks ends in real recovery. Classic is every 4th, 20 min.</p>` : ""}
      ${config.mode === "open" ? `<p class="hint">The classic stopwatch — runs until you press stop. An hourly check-in nudge can be toggled in Notifications below.</p>` : ""}`;
  }

  function aboutSectionHtml() {
    const version = esc(state.S.appVersion || "");
    const info = state.updateInfo;
    const checking = state.checkingForUpdate;
    const installing = state.installingUpdate;
    const updateRow = info
      ? `<p class="hint" style="color:var(--green-hi)">Update available: v${esc(info.version)}</p>
         <div class="setrow"><button class="pill" data-action="promptInstallUpdate" ${installing ? "disabled" : ""}>${installing ? "⟳ Installing…" : "⤓ Download & install"}</button></div>`
      : "";
    return `<p class="hint" style="margin-top:0">TaskPlayer ${version} — a playlist-style deep-work timer. One task runs at a time; the menu-bar item shows live time.</p>
      <div class="setrow"><button class="pill" data-action="checkForUpdates" ${checking ? "disabled" : ""}>${checking ? "⟳ Checking…" : "⟳ Check for updates"}</button></div>
      ${updateRow}`;
  }

  // Consolidates the old "Data" and "Diagnostics" sections into one album —
  // both are "under the hood" maintenance actions a normal workflow never
  // touches, so they read better grouped than as two more top-level albums.
  function diagnosticsSectionHtml() {
    return `<h4>Backup &amp; restore</h4>
      <p class="hint" style="margin-top:0">Back up everything — lists, tasks, and session history — to a JSON file, or restore from one.</p>
      <div class="setrow">
        <button class="pill" data-action="exportData">⤓ Export data</button>
        <button class="pill" data-action="importData">⤒ Import data</button>
      </div>
      <p class="hint">Importing replaces all current data and can't be undone.</p>
      <h4 style="margin-top:20px">Log file</h4>
      <p class="hint" style="margin-top:0">Running into a bug? Reveal the log file and attach it when you report the issue.</p>
      <div class="setrow">
        <button class="pill" data-action="revealLogs">📄 Reveal log file</button>
      </div>`;
  }

  // Renders one Settings-page "album" — an icon tile + name + subtitle
  // header (visually echoing the task-list album headers elsewhere in the
  // app, see .albhead) followed by that section's controls. Purely a layout
  // wrapper: `body` is whatever HTML the caller already built.
  function keyboardSectionHtml() {
    const on = state.keybindings;
    return `<p class="hint" style="margin-top:0">Drive the app from the keyboard — jump between views, move through lists and tasks, and play/pause without the mouse.</p>
      <div style="display:flex;align-items:center;justify-content:space-between;margin:10px 0 4px">
        <span>Keyboard shortcuts</span>
        <button class="switch${on ? " on" : ""}" role="switch" aria-checked="${on}" aria-label="Toggle keyboard shortcuts" data-action="toggleKeybindings"><span class="switch-knob"></span></button>
      </div>
      <div class="setrow"><button class="pill" data-action="showShortcuts">⌨ View shortcuts</button></div>
      <p class="hint">When off, single-key shortcuts are disabled. ⌘[ / ⌘] history navigation always works.</p>`;
  }

  function settingsAlbumHtml(icon, color, title, subtitle, body) {
    return `<section>
      <div class="salbhead">
        <div class="salb-tile" style="background:${color}22;color:${color}">${icon}</div>
        <div class="salb-meta"><div class="salb-name">${esc(title)}</div><div class="salb-sub">${esc(subtitle)}</div></div>
      </div>
      ${body}
    </section>`;
  }

  // Settings is now a list of "albums" — same idea as a task list's album
  // grouping (icon tile + name + subtitle header, see .albhead) rather than
  // plain <h4> section labels. Order follows the actual order a session
  // goes in: who you are (Account), how the timer runs (Workflow), how
  // you're alerted (Notifications), then the two "only touch this if
  // something's wrong" groups (Diagnostics, About) last.
  function renderSettingsPage() {
    if (!state.S) return;
    const account = state.S.account;
    const acctSubtitle = account ? `Signed in as ${account.name || account.email}` : "Sign in to sync across devices";
    document.getElementById("main").innerHTML = `
      ${stickyBarHtml("⚙", "Settings")}
      <div class="hdr" data-tauri-drag-region>
        <div class="cover" style="background:linear-gradient(135deg,#5a5a5a,#2e2e2e)">⚙</div>
        <div class="info"><small>App</small><h1>Settings</h1><div class="sub">Account, workflow, notifications &amp; more</div></div>
      </div>
      <div class="settings-page">
        ${settingsAlbumHtml("👤", "#509bf5", "Account", acctSubtitle, accountSectionHtml())}
        ${settingsAlbumHtml("⏱️", "#2f9e8f", "Workflow", "How the timer runs", sessionControlsHtml())}
        ${settingsAlbumHtml("🔔", "#f5a623", "Notifications", "Sounds & alerts", notificationsSectionHtml())}
        ${settingsAlbumHtml("⌨️", "#8d67ab", "Keyboard", "Shortcuts", keyboardSectionHtml())}
        ${settingsAlbumHtml("🛠️", "#9aa0a6", "Diagnostics", "Backups & logs", diagnosticsSectionHtml())}
        ${settingsAlbumHtml("ℹ️", "#6a6a6a", "About", "Version & updates", aboutSectionHtml())}
      </div>`;
    initStickyHeader();
  }

  function dayLabel(ts) {
    const date = new Date(ts);
    const now = new Date();
    const yesterday = new Date(now - 86400000);
    if (date.toDateString() === now.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  // Which "task" rows are expanded on the Insights page, keyed
  // `${dayKey}:${taskId}` so the same task on two different days toggles
  // independently. Lives only in this closure (not persisted state) since
  // it's pure UI — resets on reload, same as scroll position would.
  const expandedSessionGroups = new Set();
  function toggleSessionGroup(scopeKey, taskId) {
    const key = `${scopeKey}:${taskId}`;
    if (expandedSessionGroups.has(key)) expandedSessionGroups.delete(key);
    else expandedSessionGroups.add(key);
    renderInsightsPage();
  }

  // Day / Week / Month is a zoom level, not a different feature — pure UI
  // state, same lifetime as expandedSessionGroups above.
  let insightsPeriod = "day";
  function setInsightsPeriod(period) {
    insightsPeriod = period;
    renderInsightsPage();
  }

  function weekStartOf(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    const diffFromMonday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diffFromMonday);
    return d.getTime();
  }

  function renderInsightsPage() {
    if (!state.S) return;
    const now = Date.now();
    const items = state.S.sessions.map((session) => ({ id: session.id, taskId: session.taskId, start: session.start, end: session.end }));
    const run = state.S.run;
    if (run.activeTaskId && run.phase === "work" && run.runningStart) {
      items.push({ id: null, taskId: run.activeTaskId, start: run.runningStart, end: null, live: true });
    }
    items.sort((a, b) => b.start - a.start);

    const TRACK_PX = 640;
    const rowActionsFor = (item) => (item.live || !item.id) ? `<span class="entry-del"></span>`
      : `<button class="entry-edit" title="Edit session" data-action="editSession" data-id="${item.id}">✎</button><button class="entry-del" title="Remove session" data-action="deleteSession" data-id="${item.id}">×</button>`;

    // One ruler mechanism for every zoom level: position is always
    // `elapsed-since-period-start / period-length`, so Day and Week are the
    // exact same function — only periodMs and the major/minor tick units
    // change. Month can't keep real session slivers legible at that width
    // (a 45min session is <0.2% of a 31-day track), so it gets its own
    // builder below — see buildMonthRuler — rather than forcing a fourth
    // chart type into this one.
    function buildTrackAndRuler(periodItems, periodStart, periodMs, majorMs, minorMs, labels, nowInRange) {
      const segs = periodItems.map((item) => {
        const task = findTask(item.taskId);
        const listItem = task ? list(task.listId) : null;
        const startFrac = Math.max(0, (item.start - periodStart) / periodMs);
        const endFrac = Math.min(1, ((item.end ?? now) - periodStart) / periodMs);
        const left = startFrac * TRACK_PX;
        const width = Math.max(2, (endFrac - startFrac) * TRACK_PX);
        const label = task ? esc(task.name) : "(deleted task)";
        const range = `${new Date(item.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–${item.end ? new Date(item.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "now"}`;
        return `<i class="seg${item.live ? " live" : ""}" style="left:${left.toFixed(1)}px;width:${width.toFixed(1)}px;background:${listItem ? listItem.color : "#555"}" title="${label} · ${range} · ${fmt((item.end ?? now) - item.start)}"></i>`;
      }).join("");

      const nowNeedle = nowInRange ? `<span class="now-line" style="left:${(((now - periodStart) / periodMs) * TRACK_PX).toFixed(1)}px"></span>` : "";

      // Bold tick at every major unit, faint tick at every minor unit — the
      // minor unit here is always the major unit of the next zoom level in
      // (Day's hour = Week's minor; Week's day = Month's minor).
      const ruler = [];
      for (let ms = minorMs; ms < periodMs; ms += minorMs) {
        const isMajor = ms % majorMs === 0;
        ruler.push(`<i class="rtick${isMajor ? " major" : ""}" style="left:${((ms / periodMs) * TRACK_PX).toFixed(1)}px"></i>`);
      }

      return `<div class="daybar" style="width:${TRACK_PX}px">${segs}${nowNeedle}</div>
        <div class="dayruler" style="width:${TRACK_PX}px">${ruler.join("")}</div>
        <div class="ticks" style="width:${TRACK_PX}px">${labels.map((l) => `<span>${l}</span>`).join("")}</div>`;
    }

    // Day view only: one horizontal lane per life area instead of one flat
    // track, with note width = session duration (the "piano roll" insights
    // view). Reuses the list's existing `lifeArea` tag — same fact already
    // used by the sidebar sections and the Home radar (see LIFE_AREAS import
    // and buildLifeBalanceGrid) — rather than inventing a second grouping
    // for tasks to be sorted into (ADHD rule 8: categorization must be a
    // fact, not a decision). Untagged lists land in a fixed "Other" lane
    // rather than being forced into one of the five real areas, since
    // untagged is itself a valid, already-supported state elsewhere in the
    // app. Only areas actually touched that day get a row — a fixed
    // five-or-six-lane grid would leave most days mostly empty rows, which
    // is exactly the kind of clutter rule 5 (quick glance, not a browsable
    // destination) warns against. Lane order follows the canonical
    // LIFE_AREAS order (never user-sorted, same rule 8), with Other last.
    function buildDayLanes(dayItems, dayStart, nowInRange) {
      const periodMs = 86400000;
      const laneMap = new Map();
      for (const item of dayItems) {
        const task = findTask(item.taskId);
        const listItem = task ? list(task.listId) : null;
        const area = listItem && listItem.lifeArea ? LIFE_AREAS.find((a) => a.key === listItem.lifeArea) : null;
        const key = area ? area.key : "other";
        if (!laneMap.has(key)) laneMap.set(key, { label: area ? area.label : "Other", color: area ? area.color : "#6b6b6b", items: [] });
        laneMap.get(key).items.push(item);
      }
      const orderedKeys = [...LIFE_AREAS.map((a) => a.key), "other"].filter((k) => laneMap.has(k));
      const LANE_H = 30, NOTE_H = 20, LABEL_W = 92, LANE_GAP = 8;
      // Keep the complete Day visualization (legend + gap + plot) on the
      // same 640px axis as Week and Month. Previously the legend was added
      // beside a full-width plot, shifting Day view 100px out of alignment.
      const LANE_TRACK_PX = TRACK_PX - LABEL_W - LANE_GAP;

      // Full-height hourly gridlines behind every lane — the "map a 1-hour
      // grid onto it" ask. One weight only (no major/minor split): at day
      // width a 15-minute minor tick per lane row was more ink than signal
      // once there's more than one row.
      const gridLines = [];
      for (let h = 0; h <= 24; h++) {
        gridLines.push(`<i class="grid-line" style="left:${((h / 24) * LANE_TRACK_PX).toFixed(1)}px"></i>`);
      }

      const notes = [];
      orderedKeys.forEach((key, i) => {
        const lane = laneMap.get(key);
        const top = i * LANE_H + (LANE_H - NOTE_H) / 2;
        for (const item of lane.items) {
          const task = findTask(item.taskId);
          const startFrac = Math.max(0, (item.start - dayStart) / periodMs);
          const endFrac = Math.min(1, ((item.end ?? now) - dayStart) / periodMs);
          const left = startFrac * LANE_TRACK_PX;
          const width = Math.max(3, (endFrac - startFrac) * LANE_TRACK_PX);
          const label = task ? esc(task.name) : "(deleted task)";
          const range = `${new Date(item.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–${item.end ? new Date(item.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "now"}`;
          // Hover detail is facts only (name, exact range, exact duration) —
          // never a comparison to an estimate, so this stays a neutral
          // lookup rather than the shame-tally rule 7/9 ban on.
          const title = `${label} · ${range} · ${fmt((item.end ?? now) - item.start)}`;
          notes.push(`<i class="lane-note${item.live ? " live" : ""}" style="left:${left.toFixed(1)}px;width:${width.toFixed(1)}px;top:${top}px;height:${NOTE_H}px;background:${lane.color}" title="${title}"></i>`);
        }
      });

      const totalH = orderedKeys.length * LANE_H;
      const nowNeedle = nowInRange
        ? `<span class="now-line" style="left:${(((now - dayStart) / periodMs) * LANE_TRACK_PX).toFixed(1)}px;top:0;bottom:0"></span>`
        : "";

      const labelsHtml = orderedKeys.map((key) => `<div class="lane-label" style="height:${LANE_H}px">${esc(laneMap.get(key).label)}</div>`).join("");
      const ticksLabels = ["12a", "6a", "12p", "6p", "12a"];

      return `<div class="lanes-wrap">
        <div class="lanes-labels" style="width:${LABEL_W}px">${labelsHtml}</div>
        <div class="lanes-track" style="width:${LANE_TRACK_PX}px;height:${totalH}px">${gridLines.join("")}${notes.join("")}${nowNeedle}</div>
      </div>
      <div class="lanes-ticks-row">
        <div class="lanes-labels-spacer" style="width:${LABEL_W}px"></div>
        <div class="ticks" style="width:${LANE_TRACK_PX}px">${ticksLabels.map((l) => `<span>${l}</span>`).join("")}</div>
      </div>`;
    }

    // Month: the track's job (show real session shape) gets handed to the
    // ruler itself. Same "one tick per unit, nested inside the level
    // above" grammar as buildTrackAndRuler — day-ticks nested inside
    // week-ticks — but each day-tick now grows with that day's total and
    // tints toward whichever list got the most time, since a bare sliver
    // would round to nothing at this width. No separate colored track.
    function buildMonthRuler(monthItems, monthStart, daysInMonth) {
      const dayTotals = new Map();
      for (const item of monthItems) {
        const dayIdx = Math.floor((item.start - monthStart) / 86400000);
        if (dayIdx < 0 || dayIdx >= daysInMonth) continue;
        const dur = (item.end ?? now) - item.start;
        const entry = dayTotals.get(dayIdx) || { total: 0, byList: new Map() };
        entry.total += dur;
        const task = findTask(item.taskId);
        const listId = task ? task.listId : "none";
        entry.byList.set(listId, (entry.byList.get(listId) || 0) + dur);
        dayTotals.set(dayIdx, entry);
      }
      const maxTotal = Math.max(1, ...Array.from(dayTotals.values()).map((e) => e.total));
      const dayWidth = TRACK_PX / daysInMonth;

      const bars = [];
      for (let d = 0; d < daysInMonth; d++) {
        const entry = dayTotals.get(d);
        const left = d * dayWidth + dayWidth * 0.15;
        const width = Math.max(3, dayWidth * 0.7);
        const dateLabel = new Date(monthStart + d * 86400000).toLocaleDateString([], { month: "short", day: "numeric" });
        if (!entry || entry.total <= 0) {
          bars.push(`<span class="mday" style="left:${left.toFixed(1)}px;width:${width.toFixed(1)}px;height:2px;background:#3a3a3a" title="${dateLabel} · no tracked time"></span>`);
          continue;
        }
        let bestList = null, bestMs = -1;
        for (const [listId, ms] of entry.byList) if (ms > bestMs) { bestMs = ms; bestList = listId; }
        const listItem = bestList && bestList !== "none" ? list(bestList) : null;
        const height = Math.max(3, Math.round((entry.total / maxTotal) * 22));
        bars.push(`<span class="mday" style="left:${left.toFixed(1)}px;width:${width.toFixed(1)}px;height:${height}px;background:${listItem ? listItem.color : "#888"}" title="${dateLabel} · ${fmtLong(entry.total)}"></span>`);
      }

      // Week-boundary majors: real Mondays that fall inside the month, plus
      // the 1st itself so the leading partial week still gets a divider.
      const firstDow = new Date(monthStart).getDay();
      const offsetToMonday = (8 - firstDow) % 7;
      const majors = [];
      const labels = [];
      if (offsetToMonday !== 0) {
        majors.push(`<span class="mweek" style="left:0px"></span>`);
        labels.push(new Date(monthStart).toLocaleDateString([], { month: "short", day: "numeric" }));
      }
      for (let d = offsetToMonday; d < daysInMonth; d += 7) {
        majors.push(`<span class="mweek" style="left:${((d / daysInMonth) * TRACK_PX).toFixed(1)}px"></span>`);
        labels.push(new Date(monthStart + d * 86400000).toLocaleDateString([], { month: "short", day: "numeric" }));
      }

      const periodMs = daysInMonth * 86400000;
      const nowInRange = now >= monthStart && now < monthStart + periodMs;
      const nowNeedle = nowInRange ? `<span class="now-line" style="left:${(((now - monthStart) / periodMs) * TRACK_PX).toFixed(1)}px;top:-4px;bottom:-2px"></span>` : "";

      return `<div class="monthruler" style="width:${TRACK_PX}px">${majors.join("")}${bars.join("")}${nowNeedle}</div>
        <div class="ticks" style="width:${TRACK_PX}px">${labels.map((l) => `<span>${l}</span>`).join("")}</div>`;
    }

    // Shared by all three periods: one row per task, ranked by time spent.
    // "session" granularity (Day view) expands to each session's exact time
    // range with edit/delete actions. "day" granularity (Week/Month) expands
    // to one row per calendar day instead — a month of daily standups would
    // otherwise be 20+ near-identical timestamp rows; editing a specific
    // session is still one tap away in Day view.
    function buildTaskRollup(scopeKey, scopeItems, granularity) {
      const byTask = new Map();
      for (const item of scopeItems) {
        const key = item.taskId ?? "";
        if (!byTask.has(key)) byTask.set(key, []);
        byTask.get(key).push(item);
      }
      const taskGroups = Array.from(byTask.values()).sort((a, b) => {
        const totalA = a.reduce((sum, item) => sum + ((item.end ?? now) - item.start), 0);
        const totalB = b.reduce((sum, item) => sum + ((item.end ?? now) - item.start), 0);
        return totalB - totalA;
      });

      return taskGroups.map((groupItems) => {
        const taskId = groupItems[0].taskId;
        const task = findTask(taskId);
        const listItem = task ? list(task.listId) : null;
        const groupTotal = groupItems.reduce((sum, item) => sum + ((item.end ?? now) - item.start), 0);
        const anyLive = groupItems.some((item) => item.live);
        const name = `${task ? esc(task.name) : "(deleted task)"}${anyLive ? " · recording…" : ""}`;
        const groupKey = `${scopeKey}:${taskId}`;
        const expanded = expandedSessionGroups.has(groupKey);

        let badge, subRows;
        if (granularity === "session") {
          badge = `${groupItems.length} session${groupItems.length === 1 ? "" : "s"}`;
          subRows = expanded ? groupItems.map((item) => {
            const range = `${new Date(item.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–${item.end ? new Date(item.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "now"}`;
            return `<div class="sub-sess">
              <span class="sub-range">${range}</span>
              <span class="sub-dur">${fmt((item.end ?? now) - item.start)}</span>${rowActionsFor(item)}</div>`;
          }).join("") : "";
        } else {
          const byDay = new Map();
          for (const item of groupItems) {
            const d = new Date(item.start);
            const dKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const dur = (item.end ?? now) - item.start;
            const e = byDay.get(dKey) || { ts: item.start, total: 0 };
            e.total += dur;
            byDay.set(dKey, e);
          }
          const days = Array.from(byDay.values()).sort((a, b) => b.ts - a.ts);
          badge = `${days.length} day${days.length === 1 ? "" : "s"}`;
          subRows = expanded ? days.map((d) => `<div class="sub-sess">
            <span class="sub-range">${dayLabel(d.ts)}</span>
            <span class="sub-dur">${fmtLong(d.total)}</span></div>`).join("") : "";
        }

        const listLink = (text) => listItem
          ? `<span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true" title="Go to ${esc(listItem.name)}">${text}</span>`
          : text;
        const header = `<div class="sess task-row ${anyLive ? "live" : ""}" data-action="toggleSessionGroup" data-day="${scopeKey}" data-id="${taskId}">
          <span class="chev">${expanded ? "▾" : "▸"}</span>
          <span class="sess-dot" style="background:${listItem ? listItem.color : "#555"}"></span>
          <span class="sess-name">${listLink(name)}</span>
          <span class="sess-list">${listItem ? listLink(esc(listItem.name)) : ""}</span>
          <span class="task-badge">${badge}</span>
          <span class="sess-dur">${fmtLong(groupTotal)}</span></div>`;
        return `${header}${subRows}`;
      }).join("");
    }

    let body;
    if (!items.length) {
      body = `<div class="empty">No sessions yet. Press play on a task to start tracking.</div>`;
    } else if (insightsPeriod === "week") {
      const weekMs = 7 * 86400000;
      const weeks = new Map();
      for (const item of items) {
        const ws = weekStartOf(item.start);
        if (!weeks.has(ws)) weeks.set(ws, []);
        weeks.get(ws).push(item);
      }
      const nowWeekStart = weekStartOf(now);
      const weekKeys = Array.from(weeks.keys()).sort((a, b) => b - a);
      body = weekKeys.map((ws) => {
        const weekItems = weeks.get(ws);
        const total = weekItems.reduce((sum, item) => sum + ((item.end ?? now) - item.start), 0);
        const label = ws === nowWeekStart ? "This week" : ws === nowWeekStart - weekMs ? "Last week"
          : `Week of ${new Date(ws).toLocaleDateString([], { month: "short", day: "numeric" })}`;
        const ruler = buildTrackAndRuler(weekItems, ws, weekMs, 86400000, 21600000,
          ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"], ws === nowWeekStart);
        const rows = buildTaskRollup(`w${ws}`, weekItems, "day");
        return `<section class="sess-group">
          <div class="sess-head"><h4>${label}</h4><span class="sess-total">${fmtLong(total)}</span></div>
          ${ruler}
          ${rows}</section>`;
      }).join("");
    } else if (insightsPeriod === "month") {
      const months = new Map();
      for (const item of items) {
        const d = new Date(item.start);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!months.has(key)) months.set(key, []);
        months.get(key).push(item);
      }
      const nowD = new Date(now);
      const nowKey = `${nowD.getFullYear()}-${nowD.getMonth()}`;
      const lastD = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
      const lastKey = `${lastD.getFullYear()}-${lastD.getMonth()}`;
      const monthKeys = Array.from(months.keys()).sort((a, b) => {
        const [ay, am] = a.split("-").map(Number);
        const [by, bm] = b.split("-").map(Number);
        return (by * 12 + bm) - (ay * 12 + am);
      });
      body = monthKeys.map((key) => {
        const [y, m] = key.split("-").map(Number);
        const monthStart = new Date(y, m, 1).getTime();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const monthItems = months.get(key);
        const total = monthItems.reduce((sum, item) => sum + ((item.end ?? now) - item.start), 0);
        const label = key === nowKey ? "This month" : key === lastKey ? "Last month"
          : new Date(y, m, 1).toLocaleDateString([], { month: "long", year: "numeric" });
        const ruler = buildMonthRuler(monthItems, monthStart, daysInMonth);
        const rows = buildTaskRollup(`m${key}`, monthItems, "day");
        return `<section class="sess-group">
          <div class="sess-head"><h4>${label}</h4><span class="sess-total">${fmtLong(total)}</span></div>
          ${ruler}
          ${rows}</section>`;
      }).join("");
    } else {
      const dayKey = (ts) => {
        const date = new Date(ts);
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      };
      const groups = [];
      let currentGroup = null;
      for (const item of items) {
        const key = dayKey(item.start);
        if (!currentGroup || currentGroup.key !== key) {
          currentGroup = { key, ts: item.start, items: [] };
          groups.push(currentGroup);
        }
        currentGroup.items.push(item);
      }
      const todayKey = dayKey(now);
      body = groups.map((group) => {
        const total = group.items.reduce((sum, item) => sum + ((item.end ?? now) - item.start), 0);
        const dayStart = new Date(group.ts);
        dayStart.setHours(0, 0, 0, 0);
        const ruler = buildDayLanes(group.items, dayStart.getTime(), group.key === todayKey);
        const rows = buildTaskRollup(group.key, group.items, "session");
        return `<section class="sess-group">
          <div class="sess-head"><h4>${dayLabel(group.ts)}</h4><span class="sess-total">${fmtLong(total)}</span></div>
          ${ruler}
          ${rows}</section>`;
      }).join("");
    }

    const periodTabs = `<div class="period-tabs">
      <button class="${insightsPeriod === "day" ? "active" : ""}" data-action="setInsightsPeriod" data-value="day">Day</button>
      <button class="${insightsPeriod === "week" ? "active" : ""}" data-action="setInsightsPeriod" data-value="week">Week</button>
      <button class="${insightsPeriod === "month" ? "active" : ""}" data-action="setInsightsPeriod" data-value="month">Month</button>
    </div>`;
    const todayMs = todayTotalMs();
    const allMs = state.S.lists.reduce((sum, listItem) => sum + listTotal(listItem.id), 0);
    const doneCount = state.S.tasks.filter((task) => task.completedAt).length;
    const todayJewelCount = todayJewels();
    const allTimeJewelCount = lifetimeJewelsNet();

    document.getElementById("main").innerHTML = `
      ${stickyBarHtml(INSIGHTS_SVG, "Insights")}
      <div class="hdr" data-tauri-drag-region>
        <div class="cover" style="background:linear-gradient(135deg,#2e7d4f,#0c3f26)">${INSIGHTS_SVG_HERO}</div>
        <div class="info"><small>History</small><h1>Insights</h1><div class="sub">${items.length} session${items.length === 1 ? "" : "s"} across all tasks</div></div>
      </div>
      <div class="insights-summary">
        <div class="hs-stat"><div class="hs-num">${fmtHM(todayMs)}</div><div class="hs-label">Today</div></div>
        <div class="hs-stat"><div class="hs-num">${fmtHM(allMs)}</div><div class="hs-label">All time</div></div>
        <div class="hs-stat"><div class="hs-num">${doneCount}</div><div class="hs-label">Completed</div></div>
        <div class="hs-stat"><div class="hs-num">${state.S.lists.length}</div><div class="hs-label">Lists</div></div>
        <div class="hs-stat"><div class="hs-num">${todayJewelCount > 0 ? "+" : ""}${todayJewelCount}</div><div class="hs-label">Jewels today</div></div>
        <div class="hs-stat"><div class="hs-num">${allTimeJewelCount > 0 ? "+" : ""}${allTimeJewelCount}</div><div class="hs-label">Jewels all-time</div></div>
      </div>
      <div class="insights-page">${periodTabs}${body}</div>`;
    initStickyHeader();
  }

  // A task counts as "against" — a negative-impact activity — if it carries a
  // negative impact sign, or it lives in a list tagged to DECREASE its life
  // area (e.g. a "Substance Abuse" list). Kept in sync with the same rule
  // lifeBalanceScores/againstContributors use.
  function isAgainstTask(task) {
    if (!task) return false;
    const payout = jewelPayout(task);
    if (payout && payout.amount < 0) return true;
    const listItem = list(task.listId);
    return !!(listItem && listItem.lifeDirection === "decrease");
  }

  // The last 6 distinct tasks played, most-recent first, across every list —
  // feeds the Home page's "Jump back in" cards. Playing the same task again
  // just moves it back to #1 rather than adding a duplicate row. Against
  // (negative-impact) tasks are deliberately excluded: a "pick up where you
  // left off" nudge should never resurface a habit the user is trying to cut.
  function recentTasks(limit = 6) {
    if (!state.S) return [];
    const now = Date.now();
    const lastPlayedAt = new Map();
    for (const session of state.S.sessions) {
      const at = session.end ?? now;
      if (!lastPlayedAt.has(session.taskId) || at > lastPlayedAt.get(session.taskId)) {
        lastPlayedAt.set(session.taskId, at);
      }
    }
    const run = state.S.run;
    const liveTaskId = run.activeTaskId && run.phase === "work" && run.runningStart ? run.activeTaskId : null;
    if (liveTaskId) lastPlayedAt.set(liveTaskId, now);

    return Array.from(lastPlayedAt.entries())
      .map(([taskId, at]) => ({ task: findTask(taskId), at, live: taskId === liveTaskId }))
      .filter((entry) => entry.task && !entry.task.completedAt && !isAgainstTask(entry.task))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  }

  // Today's whole cadence:"daily" set, for the Home page's "Daily Jam"
  // section — every daily task lives in whatever list it was created in
  // (Health, Career, Growth, ...), so without this there's no single place
  // that answers "what's left in my daily set today" without hunting across
  // lists (ADHD rule 2: externalize, don't rely on memory). `doneToday`
  // reuses the exact same today-only check the task row itself uses
  // (dailyPayoutOn) — no separate source of truth, and deliberately no
  // history: a task either happened today or it didn't, nothing about
  // yesterday or a streak is computed or stored (rule 7 — no permanent
  // negative record). Not-yet-today entries sort first so the actionable
  // half of the list reads before the already-done half; no other reordering
  // (rule 8 — no extra decision imposed on the user).
  function dailyJamTasks() {
    if (!state.S) return [];
    const run = state.S.run;
    const liveTaskId = run.activeTaskId && run.phase === "work" && run.runningStart ? run.activeTaskId : null;
    const todayStartMs = new Date().setHours(0, 0, 0, 0);
    // Against (negative-impact) daily tasks are excluded — same call as
    // recentTasks() above: a checklist that pays out a jewel for "checking
    // off" a habit someone's trying to cut would be rewarding the wrong
    // thing.
    const entries = state.S.tasks
      .filter((task) => task.cadence === "daily" && !task.completedAt && !isAgainstTask(task))
      .map((task) => {
        const working = task.id === liveTaskId;
        const doneToday = working || dailyPayoutOn(task, state.S.sessions, todayStartMs);
        return { task, listItem: list(task.listId), working, doneToday };
      });
    entries.sort((a, b) => (a.doneToday === b.doneToday ? 0 : a.doneToday ? 1 : -1));
    return entries;
  }

  // A bounded, derived attention set used only for calm sidebar dots and
  // factual cues on the corresponding task rows. The ranking stays the same
  // as the former Home section: impact, deadline proximity, and lack of
  // recent work. Nothing is stored, counted over time, or shown as a failure.
  function attentionTasks(limit = ATTENTION_TASKS_SIZE) {
    if (!state.S) return [];
    const now = Date.now();
    const run = state.S.run;
    const liveTaskId = run.activeTaskId && run.phase === "work" && run.runningStart ? run.activeTaskId : null;

    const lastTouch = new Map();
    for (const session of state.S.sessions) {
      const at = session.end ?? now;
      if (!lastTouch.has(session.taskId) || at > lastTouch.get(session.taskId)) {
        lastTouch.set(session.taskId, at);
      }
    }

    return state.S.tasks
      .filter((task) => !task.completedAt && task.id !== liveTaskId)
      .filter((task) => task.deadlineAt && (task.impactTier === "medium" || task.impactTier === "high"))
      .map((task) => {
        const daysLeft = (task.deadlineAt - now) / 86400000;
        const touchedAt = lastTouch.get(task.id) ?? null;
        const daysSinceTouch = touchedAt ? (now - touchedAt) / 86400000 : Infinity;
        // 0 (a week or more out) to 1 (today or overdue) — clamped so an
        // old overdue task can't keep climbing past "maximally urgent"
        // forever. That unbounded growth is exactly the loss/urgency shape
        // the ADHD x gamification hard constraints in CLAUDE.md ban.
        const urgency = Math.max(0, Math.min(1, 1 - daysLeft / 7));
        // Has this task been left alone while its deadline closes in? A
        // task touched today scores low here even with a near deadline —
        // it's already in motion, doesn't need resurfacing.
        const neglect = Math.max(0, Math.min(1, daysSinceTouch / Math.max(daysLeft, 1)));
        const weight = IMPACT_TIERS[task.impactTier].weight;
        return { task, score: weight * (0.6 * urgency + 0.4 * neglect) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.task);
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Good night";
  }

  function greetingEmoji() {
    const h = new Date().getHours();
    if (h < 5) return "🌙";
    if (h < 12) return "🌤️";
    if (h < 17) return "☀️";
    if (h < 21) return "🌇";
    return "🌙";
  }

  // Sum of every session's overlap with [midnight today, now] — clamping
  // each session's own start/end into that window (rather than filtering
  // whole sessions by which day they started on) so a session that's still
  // running from before midnight, or one still in progress right now, both
  // count only the portion that actually falls today.
  function todayTotalMs() {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    const start = cutoff.getTime();
    const now = Date.now();
    return state.S.sessions.reduce((sum, session) => {
      const segStart = Math.max(session.start, start);
      const segEnd = Math.min(session.end ?? now, now);
      return sum + Math.max(0, segEnd - segStart);
    }, 0);
  }

  // Same overlap-clamp idea as todayTotalMs, scoped to one task — feeds the
  // "daily" cadence row's today-only bar (see taskRow in renderMain) instead
  // of the lifetime total every other row shows.
  function todayMsForTask(taskId) {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    const start = cutoff.getTime();
    const now = Date.now();
    return state.S.sessions.reduce((sum, session) => {
      if (session.taskId !== taskId) return sum;
      const segStart = Math.max(session.start, start);
      const segEnd = Math.min(session.end ?? now, now);
      return sum + Math.max(0, segEnd - segStart);
    }, 0);
  }

  // 5 hours in a 7-day window is treated as "full" (100%) on every radar
  // axis — a single, deliberately uniform first-pass heuristic rather than
  // a per-area target, since the app has no basis (yet) for knowing what
  // "enough" relationships time vs. "enough" gym time actually looks like
  // for a given person. Same cap for every axis keeps the shape legible:
  // an area reading low genuinely means "little time went there this
  // week," not "this axis just has a stricter bar."
  const LIFE_BALANCE_CAP_MS = 5 * 60 * 60 * 1000;

  // A completed, impact-tagged task contributes this many ms-equivalent per
  // tier weight point to its axis (see jewelPayout's `weight`) instead of its
  // actual session time — this is the whole point of tagging impact
  // separately from duration: a 5-minute `high` task (weight 4) swings the
  // axis by 160min, more than a `low` (weight 1) task's 40min even if the
  // low-tier one ran for hours. `high` is the top tier now that `severe`
  // (weight 8) has been dropped, so a single task's max swing is smaller
  // than it used to be — no longer "most of LIFE_BALANCE_CAP_MS," just a
  // clear, still-outsized nudge relative to low/medium.
  const IMPACT_WEIGHT_TO_MS = 40 * 60 * 1000;

  // Scores every LIFE_AREAS axis from the trailing 7 days, for the Home
  // page's radar chart. A list only contributes if it's been tagged (see
  // commands.js's editList/addList) with a `lifeArea`. Two kinds of tasks
  // feed an axis: a completed task with an impact tier set contributes a
  // fixed tier-sized swing using its OWN for/against sign (ignoring the
  // list's direction — the tier already encodes direction more precisely
  // than the list-level default); every other task just contributes its
  // raw tracked time, signed by the list's `lifeDirection` ("increase" |
  // "decrease"), same as before impact tiers existed. Each session's own
  // start/end is clamped into the 7-day window (same overlap trick as
  // todayTotalMs) so a long-running session only counts its portion that
  // actually falls in range.
  // Positive and negative contributions are accumulated separately (not just
  // netted) so the radar can optionally show an "against" overlay — how much
  // time/impact pulled *against* each area — instead of that drag silently
  // disappearing under the 0% floor the way a pure net score does. `pct`
  // stays the net (the main green shape, unchanged); `negPct` is the against
  // magnitude, only surfaced when the user toggles it on (see renderHomePage
  // / buildLifeRadar). Both are windowed to the trailing 7 days, so the
  // against shape fades with time and never becomes a standing record
  // (CLAUDE.md rule 7).
  function lifeBalanceScores() {
    const empty = LIFE_AREAS.map((area) => ({ ...area, ms: 0, pct: 0, negMs: 0, negPct: 0 }));
    if (!state.S) return empty;
    const now = Date.now();
    const windowStart = now - 7 * 24 * 60 * 60 * 1000;
    const posMs = new Map(LIFE_AREAS.map((area) => [area.key, 0]));
    const negMs = new Map(LIFE_AREAS.map((area) => [area.key, 0]));
    const addPos = (key, ms) => posMs.set(key, posMs.get(key) + ms);
    const addNeg = (key, ms) => negMs.set(key, negMs.get(key) + ms);
    for (const listItem of state.S.lists) {
      if (!listItem.lifeArea || !posMs.has(listItem.lifeArea)) continue;
      let timeMs = 0;
      for (const task of tasksForList(listItem.id)) {
        const payout = jewelPayout(task);
        // A "daily" task never sets completedAt, so it gets its own branch
        // rather than falling through to the completedAt check below (which
        // would never match) and then double-counting via raw session time.
        // Each qualifying day in the window contributes one full tier swing —
        // the cadence equivalent of "completed once in this window" repeated
        // per day it actually happened.
        if (payout && task.cadence === "daily") {
          const days = dailyPayoutDayCount(task, state.S.sessions, windowStart, now);
          if (days > 0) {
            const swing = payout.amount * IMPACT_WEIGHT_TO_MS * days;
            if (swing >= 0) addPos(listItem.lifeArea, swing);
            else addNeg(listItem.lifeArea, -swing);
          }
          continue;
        }
        if (payout && task.completedAt && task.completedAt >= windowStart && task.completedAt <= now) {
          const swing = payout.amount * IMPACT_WEIGHT_TO_MS;
          if (swing >= 0) addPos(listItem.lifeArea, swing);
          else addNeg(listItem.lifeArea, -swing);
          continue;
        }
        for (const session of taskSessions(task.id)) {
          const segStart = Math.max(session.start, windowStart);
          const segEnd = Math.min(session.end ?? now, now);
          timeMs += Math.max(0, segEnd - segStart);
        }
      }
      if (listItem.lifeDirection === "decrease") addNeg(listItem.lifeArea, timeMs);
      else addPos(listItem.lifeArea, timeMs);
    }
    return LIFE_AREAS.map((area) => {
      const neg = negMs.get(area.key);
      const net = posMs.get(area.key) - neg;
      const pct = Math.max(0, Math.min(100, Math.round((net / LIFE_BALANCE_CAP_MS) * 100)));
      const negPct = Math.max(0, Math.min(100, Math.round((neg / LIFE_BALANCE_CAP_MS) * 100)));
      return { ...area, ms: net, pct, negMs: neg, negPct };
    });
  }

  // Lifetime positive jewels, bucketed by life area ("other" for untagged
  // lists) — feeds the rank badge below. Distinct from lifeBalanceScores
  // above: that's a rolling 7-day *time* budget for the radar; this is an
  // all-time *jewel* sum with no window, since rank is meant to never reset
  // or go backwards. Only positive amounts count — an against-tagged task's
  // negative jewels don't feed rank at all (see RANKS' comment in utils.js:
  // rank must only ever climb, never demote).
  function lifetimeJewelsByArea() {
    const totals = new Map();
    if (!state.S) return totals;
    const now = Date.now();
    const add = (key, amount) => totals.set(key, (totals.get(key) || 0) + amount);
    for (const task of state.S.tasks) {
      const payout = jewelPayout(task);
      if (!payout || payout.amount <= 0) continue;
      const listItem = list(task.listId);
      const key = listItem && listItem.lifeArea ? listItem.lifeArea : "other";
      if (task.cadence === "daily") {
        const days = dailyPayoutDayCount(task, state.S.sessions, 0, now);
        if (days > 0) add(key, payout.amount * days);
      } else if (task.completedAt) {
        add(key, payout.amount);
      }
    }
    return totals;
  }

  // Current rank + progress toward the next tier (see RANKS/
  // RANK_AREA_CAP_RATIO in utils.js). Crossing a tier requires a "balanced"
  // score — no single bucket (area, or "other" for untagged work) counts
  // for more than RANK_AREA_CAP_RATIO of that tier's threshold — so
  // hyperfocusing lifetime jewels into one or two favorite areas caps out
  // and stalls the badge rather than sailing to Crescendo. Computed fresh
  // every render from lifetimeJewelsByArea(), nothing persisted. Falls back
  // to a plain uncapped sum if the person hasn't tagged any list with a
  // life area yet — there's nothing to balance across, same reasoning as
  // the radar only rendering once hasLifeTags is true.
  function buildRankInfo() {
    if (!state.S) return null;
    const byArea = lifetimeJewelsByArea();
    const hasLifeTags = state.S.lists.some((listItem) => listItem.lifeArea);
    const rawTotal = Array.from(byArea.values()).reduce((sum, v) => sum + v, 0);
    const balancedScoreFor = (tier) => {
      if (!hasLifeTags) return rawTotal;
      const cap = tier.min * RANK_AREA_CAP_RATIO;
      let total = 0;
      for (const v of byArea.values()) total += Math.min(v, cap);
      return total;
    };
    let current = RANKS[0];
    for (let i = 1; i < RANKS.length; i++) {
      // Epsilon guard: capping several buckets at `tier.min / 3` and summing
      // them back up can land a hair under the threshold on pure floating-
      // point rounding (e.g. three even buckets meant to hit exactly 50
      // summing to 49.999999999999993) — without this, a genuinely balanced
      // person could get stuck one render-cycle short of a tier they've
      // actually earned.
      if (balancedScoreFor(RANKS[i]) >= RANKS[i].min - 1e-6) current = RANKS[i];
      else break;
    }
    const currentIdx = RANKS.indexOf(current);
    const next = RANKS[currentIdx + 1] || null;
    const progress = next ? Math.min(balancedScoreFor(next), next.min) : null;
    return { current, next, progress, rawTotal };
  }

  // Plain, honest jewel ledgers for the Home stats row — distinct from
  // buildRankInfo's rawTotal, which only sums positive amounts because rank
  // must never go down. These are just "how many jewels did today/all time
  // actually net out to" and are allowed to include negative (against-task)
  // amounts, same as the jewel-dot preview itself already shows a "−" for
  // those. Neither is stored — recomputed fresh every render like every
  // other jewel number in the app.
  function todayJewels() {
    if (!state.S) return 0;
    const todayStartMs = new Date().setHours(0, 0, 0, 0);
    let total = 0;
    for (const task of state.S.tasks) {
      const payout = jewelPayout(task);
      if (!payout) continue;
      if (task.cadence === "daily") {
        if (dailyPayoutOn(task, state.S.sessions, todayStartMs)) total += payout.amount;
      } else if (task.completedAt && task.completedAt >= todayStartMs) {
        total += payout.amount;
      }
    }
    return total;
  }

  function lifetimeJewelsNet() {
    if (!state.S) return 0;
    const now = Date.now();
    let total = 0;
    for (const task of state.S.tasks) {
      const payout = jewelPayout(task);
      if (!payout) continue;
      if (task.cadence === "daily") {
        total += payout.amount * dailyPayoutDayCount(task, state.S.sessions, 0, now);
      } else if (task.completedAt) {
        total += payout.amount;
      }
    }
    return total;
  }

  // A single day, per area, is judged "full" past this — a solid session or
  // one high-tier task. Independent of LIFE_BALANCE_CAP_MS (that one's a
  // whole-week budget spread across every axis); this is its own per-day,
  // per-area scale for the grid below, since "how loud was Tuesday" isn't
  // the same question as "how loud was this week."
  const LIFE_BALANCE_DAILY_CAP_MS = 90 * 60 * 1000;

  // A cell's contributors can pick up the same task twice (two sessions
  // inside one calendar day) — folded here into one entry per task so the
  // side panel (buildGridCellDetail below) shows one row per task, not one
  // per session.
  function mergeContributors(list) {
    const byTask = new Map();
    for (const c of list) {
      const existing = byTask.get(c.taskId);
      if (existing) existing.ms += c.ms;
      else byTask.set(c.taskId, { ...c });
    }
    return Array.from(byTask.values()).sort((a, b) => Math.abs(b.ms) - Math.abs(a.ms));
  }

  // Buckets the same 7-day contributor data lifeBalanceScores() computes,
  // but by calendar day instead of summed across the week — the answer to
  // "which days" rather than "which tasks." A session spanning midnight is
  // split across both days (same clamp-per-day approach as the Insights
  // page's own day grouping), and a tier-tagged completion lands entirely
  // on the day it was completed, matching lifeBalanceScores' own rule that
  // a tier swing replaces, rather than adds to, that task's raw time.
  //
  // Each cell keeps its own `contributors` (not just the summed `ms`) so a
  // click on that cell (see selectGridCell/buildGridCellDetail below) can
  // answer "which task did this," the same job the radar's now-removed
  // bars used to do for a whole week — just scoped down to one day.
  function lifeBalanceDailyGrid() {
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const startMs = d.getTime();
      days.push({
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        isToday: i === 0,
        startMs,
        endMs: startMs + 24 * 60 * 60 * 1000,
      });
    }
    const rows = LIFE_AREAS.map((area) => ({
      ...area,
      cells: days.map(() => ({ ms: 0, contributors: [] })),
    }));
    if (!state.S) return { days, rows };
    const rowByKey = new Map(rows.map((row) => [row.key, row]));

    for (const listItem of state.S.lists) {
      const row = rowByKey.get(listItem.lifeArea);
      if (!row) continue;
      for (const task of tasksForList(listItem.id)) {
        const payout = jewelPayout(task);
        // "daily" task: check each of the 7 day-buckets independently
        // (dailyPayoutOn) instead of the single completedAt check below —
        // it can land tier swings on several of this week's days, not just
        // one, since it has no single completion date to place.
        if (payout && task.cadence === "daily") {
          days.forEach((day, dayIndex) => {
            if (!dailyPayoutOn(task, state.S.sessions, day.startMs)) return;
            const tierMs = payout.amount * IMPACT_WEIGHT_TO_MS;
            const cell = row.cells[dayIndex];
            cell.ms += tierMs;
            cell.contributors.push({
              taskId: task.id, taskName: task.name, listName: listItem.name, listColor: listItem.color,
              kind: "tier", tier: task.impactTier, amount: payout.amount, ms: tierMs,
            });
          });
          continue;
        }
        if (payout && task.completedAt) {
          const dayIndex = days.findIndex((day) => task.completedAt >= day.startMs && task.completedAt < day.endMs);
          if (dayIndex !== -1) {
            const tierMs = payout.amount * IMPACT_WEIGHT_TO_MS;
            const cell = row.cells[dayIndex];
            cell.ms += tierMs;
            cell.contributors.push({
              taskId: task.id, taskName: task.name, listName: listItem.name, listColor: listItem.color,
              kind: "tier", tier: task.impactTier, amount: payout.amount, ms: tierMs,
            });
          }
          continue;
        }
        for (const session of taskSessions(task.id)) {
          const sessionEnd = session.end ?? Date.now();
          days.forEach((day, dayIndex) => {
            const segStart = Math.max(session.start, day.startMs);
            const segEnd = Math.min(sessionEnd, day.endMs);
            if (segEnd <= segStart) return;
            const dur = segEnd - segStart;
            const signed = listItem.lifeDirection === "decrease" ? -dur : dur;
            const cell = row.cells[dayIndex];
            cell.ms += signed;
            cell.contributors.push({
              taskId: task.id, taskName: task.name, listName: listItem.name, listColor: listItem.color,
              kind: "time", ms: signed,
            });
          });
        }
      }
    }
    rows.forEach((row) => {
      row.cells = row.cells.map((cell) => ({ ms: cell.ms, contributors: mergeContributors(cell.contributors) }));
    });
    return { days, rows };
  }

  // Which single grid cell (if any) is expanded — pure UI state, same
  // lifetime/reset-on-reload contract as expandedSessionGroups elsewhere on
  // this page. Only one cell at a time, and its detail renders beside the
  // grid rather than as a separate page, for the same reason the bars used
  // to render in place rather than behind a separate "impact" stats screen.
  let selectedGridCell = null;
  function selectGridCell(areaKey, dayIndexRaw) {
    const dayIndex = Number(dayIndexRaw);
    selectedGridCell = selectedGridCell && selectedGridCell.areaKey === areaKey && selectedGridCell.dayIndex === dayIndex
      ? null
      : { areaKey, dayIndex };
    renderHomePage();
  }

  // Which area's "pulling against" detail is open (radar overlay is clickable
  // — see buildLifeRadar's against dots). Same one-at-a-time, reset-on-reload
  // contract as selectedGridCell above.
  let selectedAgainstArea = null;
  function selectAgainstArea(areaKey) {
    selectedAgainstArea = selectedAgainstArea === areaKey ? null : areaKey;
    renderHomePage();
  }

  // The tasks that pulled against one area over the trailing 7 days — the
  // detail behind a clicked against-vertex. Mirrors lifeBalanceScores' own
  // "what counts as against" rule exactly: a completed task with a negative
  // impact tier (regardless of its list's direction), or raw tracked time in
  // a list tagged `decrease`. Same window, so it fades with the radar shape.
  function againstContributors(areaKey) {
    if (!state.S) return [];
    const now = Date.now();
    const windowStart = now - 7 * 24 * 60 * 60 * 1000;
    const out = [];
    for (const listItem of state.S.lists) {
      if (listItem.lifeArea !== areaKey) continue;
      for (const task of tasksForList(listItem.id)) {
        const payout = jewelPayout(task);
        if (payout && task.cadence === "daily") {
          if (payout.amount < 0) {
            const days = dailyPayoutDayCount(task, state.S.sessions, windowStart, now);
            if (days > 0) {
              out.push({ taskId: task.id, taskName: task.name, listName: listItem.name, listColor: listItem.color,
                kind: "tier", tier: task.impactTier, amount: payout.amount, ms: -payout.amount * IMPACT_WEIGHT_TO_MS * days });
            }
          }
          continue;
        }
        if (payout && task.completedAt && task.completedAt >= windowStart && task.completedAt <= now) {
          if (payout.amount < 0) {
            out.push({ taskId: task.id, taskName: task.name, listName: listItem.name, listColor: listItem.color,
              kind: "tier", tier: task.impactTier, amount: payout.amount, ms: -payout.amount * IMPACT_WEIGHT_TO_MS });
          }
          continue;
        }
        if (listItem.lifeDirection !== "decrease") continue;
        let ms = 0;
        for (const session of taskSessions(task.id)) {
          const segStart = Math.max(session.start, windowStart);
          const segEnd = Math.min(session.end ?? now, now);
          ms += Math.max(0, segEnd - segStart);
        }
        if (ms > 0) out.push({ taskId: task.id, taskName: task.name, listName: listItem.name, listColor: listItem.color, kind: "time", ms });
      }
    }
    return mergeContributors(out);
  }

  // Detail panel for a clicked against-vertex — same row vocabulary as the
  // grid's buildGridCellDetail (tap-through to the task via searchGoTask), but
  // week-scoped and against-only. Neutral wording ("pulling against"), no
  // count-of-failures tally — CLAUDE.md rules 7/9.
  function buildAgainstDetail(areaKey) {
    const area = LIFE_AREAS.find((a) => a.key === areaKey);
    if (!area) return "";
    const items = againstContributors(areaKey);
    const rows = items.length
      ? items.map((c) => {
          const amountHtml = c.kind === "tier"
            ? `<span class="lg-item-amt"><i class="jewel-dot neg"></i>${c.amount} ${esc(IMPACT_TIERS[c.tier]?.label ?? "")}</span>`
            : `<span class="lg-item-amt">−${fmtLong(c.ms)}</span>`;
          return `<div class="lg-item" data-action="searchGoTask" data-id="${c.taskId}">
            <span class="lg-item-dot" style="background:${c.listColor || "#555"}"></span>
            <span class="lg-item-name">${esc(c.taskName)}</span>
            ${amountHtml}
          </div>`;
        }).join("")
      : `<div class="lg-item-empty">Nothing pulling against here.</div>`;
    return `<div class="lg-detail against-detail">
      <div class="lg-detail-head">Pulling against ${esc(area.label)} <span class="lg-detail-day">last 7 days</span></div>
      ${rows}
    </div>`;
  }

  // The clicked cell's own contributors, listed newest-swing-first, each
  // one a tap-through to that task via searchGoTask — same "Mostly <task>"
  // job the old bars did, just answering for one day instead of the week.
  function buildGridCellDetail(row, day, cell) {
    const rows = cell.contributors.length
      ? cell.contributors.map((c) => {
          const amountHtml = c.kind === "tier"
            ? `<span class="lg-item-amt"><i class="jewel-dot${c.amount < 0 ? " neg" : ""}"></i>${c.amount > 0 ? "+" : ""}${c.amount} ${esc(IMPACT_TIERS[c.tier]?.label ?? "")}</span>`
            : `<span class="lg-item-amt">${c.ms < 0 ? "−" : ""}${fmtLong(Math.abs(c.ms))}</span>`;
          return `<div class="lg-item" data-action="searchGoTask" data-id="${c.taskId}">
            <span class="lg-item-dot" style="background:${c.listColor || "#555"}"></span>
            <span class="lg-item-name">${esc(c.taskName)}</span>
            ${amountHtml}
          </div>`;
        }).join("")
      : `<div class="lg-item-empty">Nothing tracked here.</div>`;
    return `<div class="lg-detail">
      <div class="lg-detail-head">${esc(row.label)} <span class="lg-detail-day">${esc(day.label)}</span></div>
      ${rows}
    </div>`;
  }

  // Home's whole "which task caused this" answer now lives here — areas
  // down the rows, days across the columns, cell opacity carries
  // intensity, and clicking a cell opens that cell's own task list beside
  // the grid (buildGridCellDetail above) instead of a separate page. It's
  // the areas' own fixed LIFE_AREAS color carrying identity in a cell (not
  // a list's color), since a single cell can blend contributions from
  // several lists.
  function buildLifeBalanceGrid() {
    const { days, rows } = lifeBalanceDailyGrid();
    const header = `<div class="lg-row lg-head">
      <span class="lg-label"></span>
      ${days.map((day) => `<span class="lg-cell-label${day.isToday ? " today" : ""}">${esc(day.label)}</span>`).join("")}
    </div>`;
    const body = rows.map((row) => `<div class="lg-row">
      <span class="lg-label">${esc(row.label)}</span>
      ${row.cells.map((cell, i) => {
        const opacity = Math.max(0.08, Math.min(1, 0.12 + 0.88 * (Math.abs(cell.ms) / LIFE_BALANCE_DAILY_CAP_MS)));
        const title = cell.ms !== 0 ? `${row.label} · ${days[i].label} · ${cell.ms < 0 ? "−" : ""}${fmtLong(Math.abs(cell.ms))}` : `${row.label} · ${days[i].label} · nothing tracked`;
        const selected = selectedGridCell && selectedGridCell.areaKey === row.key && selectedGridCell.dayIndex === i;
        return `<span class="lg-cell${selected ? " selected" : ""}" data-action="selectGridCell" data-key="${row.key}" data-value="${i}" style="background:${row.color};opacity:${opacity.toFixed(2)}" title="${esc(title)}"></span>`;
      }).join("")}
    </div>`).join("");
    const gridCol = `<div class="lg-grid-col">${header}${body}<div class="lg-legend">Lighter to darker means less to more time</div></div>`;

    let detail = "";
    if (selectedGridCell) {
      const row = rows.find((r) => r.key === selectedGridCell.areaKey);
      const day = days[selectedGridCell.dayIndex];
      if (row && day) detail = buildGridCellDetail(row, day, row.cells[selectedGridCell.dayIndex]);
    }
    return `<div class="lg-wrap${detail ? " has-detail" : ""}">${gridCol}${detail}</div>`;
  }

  // Renders `scores` (7 {key,label,pct} entries from lifeBalanceScores())
  // as a heptagon radar: 4 concentric rings + spokes as a static grid,
  // then the actual data as a filled polygon on top. Plain trigonometry —
  // axis i sits at angle -90° + i*(360/n)°, so axis 0 is straight up and
  // the rest go clockwise, matching how radar charts conventionally read.
  function buildLifeRadar(scores, { against = false, selectedAgainst = null } = {}) {
    // Non-square viewBox, wider than it is tall — the grid itself is round,
    // but its text labels aren't: "Health & Fitness"/"Relationships"/
    // "Mental Wellbeing" etc. sit anchor-start/anchor-end off the left and
    // right vertices and need real horizontal room past the ring, or SVG's
    // default overflow:hidden on the viewBox just clips them at the edge
    // (a square, tightly-fit box was exactly what did that before). A first
    // pass at 420 wide was still ~20px short for the longest labels once
    // actually measured in the system font — 520 leaves 70px+ of slack on
    // every side instead of cutting it close on an estimate.
    const width = 520;
    const height = 320;
    const cx = width / 2;
    const cy = height / 2 - 2;
    const maxR = 84;
    const n = scores.length;
    const angleFor = (i) => -Math.PI / 2 + i * ((2 * Math.PI) / n);
    const pointAt = (i, frac) => {
      const a = angleFor(i);
      return [cx + Math.cos(a) * maxR * frac, cy + Math.sin(a) * maxR * frac];
    };
    const rings = [0.25, 0.5, 0.75, 1].map((frac) =>
      `<polygon points="${scores.map((_, i) => pointAt(i, frac).join(",")).join(" ")}" fill="none" stroke="#333" stroke-width="1"/>`
    ).join("");
    const spokes = scores.map((_, i) => {
      const [x, y] = pointAt(i, 1);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#333" stroke-width="1"/>`;
    }).join("");
    // A pure 0% score would collapse every vertex onto the center, making
    // an all-zero radar invisible instead of reading as "flat" — a tiny
    // 4% floor keeps the polygon's shape visible without meaningfully
    // exaggerating any real (non-zero) score.
    const dataPts = scores.map((s, i) => pointAt(i, Math.max(0.04, s.pct / 100)));
    const dataPoly = `<polygon points="${dataPts.map((p) => p.join(",")).join(" ")}" fill="var(--green)" fill-opacity="0.22" stroke="var(--green)" stroke-width="2"/>`;
    // Plain and static on purpose — this chart's one job is the instant
    // shape of the week; the "why" now lives in buildLifeBalanceGrid below
    // it, so the radar itself doesn't need to carry any interaction of its
    // own.
    const dots = dataPts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3" fill="var(--green)"><title>${esc(scores[i].label)}: ${scores[i].pct}%</title></circle>`).join("");
    // Optional "pulling against" overlay (see lifeBalanceScores' negPct) —
    // drawn under the green net shape, in a muted dashed grey rather than red:
    // it reads as a quiet counterweight, not an alarm (CLAUDE.md rules 7/9 —
    // no shame tally, no punitive tone). Only rendered when the user toggles
    // it on AND something actually pulled against an area this week, so it's
    // never standing chrome.
    const showAgainst = against && scores.some((s) => s.negPct > 0);
    const againstPts = scores.map((s, i) => pointAt(i, s.negPct / 100));
    const againstPoly = showAgainst
      ? `<polygon points="${againstPts.map((p) => p.join(",")).join(" ")}" fill="#8f8f8f" fill-opacity="0.12" stroke="#8f8f8f" stroke-width="1.5" stroke-dasharray="3 3"/>`
      : "";
    const againstDots = showAgainst
      ? scores.map((s, i) => {
          if (s.negPct <= 0) return "";
          const sel = selectedAgainst === s.key;
          return `<circle class="radar-against-dot" cx="${againstPts[i][0]}" cy="${againstPts[i][1]}" r="${sel ? 5 : 4}" fill="#8f8f8f"${sel ? ' stroke="#fff" stroke-width="1.5"' : ""} data-action="selectAgainstArea" data-key="${s.key}"><title>${esc(s.label)} — pulling against: ${s.negPct}% · click for detail</title></circle>`;
        }).join("")
      : "";
    const labels = scores.map((s, i) => {
      const [lx, ly] = pointAt(i, 1.2);
      const anchor = Math.abs(lx - cx) < 4 ? "middle" : lx > cx ? "start" : "end";
      return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="var(--muted)">${esc(s.label)}</text>`;
    }).join("");
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="300">${rings}${spokes}${againstPoly}${dataPoly}${dots}${againstDots}${labels}</svg>`;
  }

  // Toggle the radar's "pulling against" overlay (persisted, default off —
  // Home stays calm and accomplishment-first unless the user opts into the
  // reflection view). See renderHomePage / buildLifeRadar.
  function toggleLifeAgainst() {
    state.lifeBalanceAgainst = !state.lifeBalanceAgainst;
    if (!state.lifeBalanceAgainst) selectedAgainstArea = null;
    try { localStorage.setItem("tp.lifeAgainst", state.lifeBalanceAgainst ? "1" : "0"); } catch (e) { /* non-fatal */ }
    renderHomePage();
  }

  // Enable/disable single-key keyboard shortcuts (see bootstrap.js). Persisted
  // like the other UI prefs; re-renders Settings so the switch reflects state.
  function toggleKeybindings() {
    state.keybindings = !state.keybindings;
    try { localStorage.setItem("tp.keybindings", state.keybindings ? "1" : "0"); } catch (e) { /* non-fatal */ }
    renderSettingsPage();
  }

  // Home — the dashboard #tbhome/goHome() lands on: a time-of-day greeting,
  // the life-balance radar (lifeBalanceScores()/buildLifeRadar() above — now
  // itself weighted by impact tier, see that function's comment), and a
  // "Jump back in" row of recentTasks() as cards. List navigation stays in
  // the sidebar rather than being duplicated here. Reuses the standard
  // .hdr/.cover/.info header component (clearAccent() below keeps it on the
  // plain grey wash, same as Settings/Insights) so it gets the same drag region,
  // gradient and sticky mini-header behavior as every other page for free.
  // This page used to also carry a separate "Impact & progress" section
  // (mana bar, per-area vitality rings, a rank ladder card) — cut; see
  // utils.js's comment for why. The radar above is now the one place impact
  // shows up on Home.
  function renderHomePage() {
    if (!state.S) return;
    const radarScores = lifeBalanceScores();
    const hasLifeTags = state.S.lists.some((listItem) => listItem.lifeArea);
    const hasAgainst = radarScores.some((s) => s.negPct > 0);
    const againstOn = state.lifeBalanceAgainst;
    const dailyEntries = dailyJamTasks();
    const dailyDoneCount = dailyEntries.filter((entry) => entry.doneToday).length;
    const dailyPct = dailyEntries.length ? Math.round((dailyDoneCount / dailyEntries.length) * 100) : 0;
    const jump = recentTasks(RECENT_TASKS_SIZE);
    const jumpHtml = jump.length
      ? jump.map((entry) => {
          const { task, at, live } = entry;
          const listItem = list(task.listId);
          const meta = live ? `<span style="color:var(--green)">now · recording</span>` : timeAgo(at);
          return `<div class="jb-card" data-action="searchGoTask" data-id="${task.id}">
            <span class="jb-dot" style="background:${listItem ? listItem.color : "#555"}"></span>
            <div class="jb-body">
              <div class="jb-name">${esc(task.name)}</div>
              <div class="jb-meta">${listItem ? esc(listItem.name) + " · " : ""}${meta}</div>
            </div>
            <button class="jb-play" data-action="play" data-id="${task.id}" data-stop-propagation="true" title="${live ? "Stop" : "Start"}">${live ? "⏸" : "▶"}</button>
          </div>`;
        }).join("")
      : `<div class="home-empty">Nothing played yet — press play on any task to start tracking.</div>`;

    const todayMs = todayTotalMs();

    // Rank badge: a quiet fact in the greeting line, not a stat tile of its
    // own — see buildRankInfo above for why it's capped/balanced rather than
    // a flat lifetime sum. Tooltip spells out the next tier and its plain-
    // language subtitle so the dynamics-marking name (Forte, Fortissimo...)
    // is legible without knowing music theory.
    const rankInfo = buildRankInfo();
    const rankBadgeHtml = rankInfo
      ? `<span class="rank-badge" title="${esc(rankInfo.current.sub)}${rankInfo.next ? ` — ${Math.round(rankInfo.progress)} of ${rankInfo.next.min} to ${esc(rankInfo.next.label)}` : ""}">${esc(rankInfo.current.label)}</span>`
      : "";

    document.getElementById("main").innerHTML = `
      ${stickyBarHtml(HOME_SVG, "Home")}
      <div class="hdr" data-tauri-drag-region>
        <div class="cover" style="background:linear-gradient(135deg,#3a3a3a,#1c1c1c)">${greetingEmoji()}</div>
        <div class="info"><small>${esc(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</small><h1>${greeting()}</h1><div class="sub">${fmtHM(todayMs)} tracked today · ${rankBadgeHtml}</div></div>
      </div>
      <div class="home-body">
        <section class="home-section">
          <h4>Jump back in</h4>
          <div class="jb-grid">${jumpHtml}</div>
        </section>
        <section class="home-section">
          <h4>Daily Jam${dailyEntries.length ? `<span class="home-sub-note">· ${dailyDoneCount} of ${dailyEntries.length} today</span>` : ""}</h4>
          <div id="dailyJamRoot"></div>
        </section>
        <section class="home-section">
          <h4>Life balance <span class="home-sub-note">· last 7 days</span>${hasLifeTags && hasAgainst ? `<button class="home-toggle" data-action="toggleLifeAgainst">${againstOn ? "Hide what's pulling against" : "Show what's pulling against"}</button>` : ""}</h4>
          ${hasLifeTags
            ? `<div class="home-radar">${buildLifeRadar(radarScores, { against: againstOn, selectedAgainst: againstOn ? selectedAgainstArea : null })}</div>${againstOn && hasAgainst ? `<div class="radar-legend"><span class="rl-swatch"></span>Time pulling against your areas · last 7 days · tap a grey dot for detail</div>` : ""}${againstOn && selectedAgainstArea ? `<div class="against-detail-wrap">${buildAgainstDetail(selectedAgainstArea)}</div>` : ""}${buildLifeBalanceGrid()}`
            : `<div class="home-empty">Tag a list with a life area (Edit list, or when creating a new one) to see your balance here.</div>`}
        </section>
      </div>`;
    litRender(dailyJam({
      state,
      entries: dailyEntries,
      doneCount: dailyDoneCount,
      percent: dailyPct,
      taskSessions,
      taskTotal,
      attentionTaskIds: new Set(attentionTasks().map((task) => task.id)),
    }), document.getElementById("dailyJamRoot"));
    initStickyHeader();
  }

  const M_NOTE_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  const M_SKIP_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z"/></svg>`;
  const M_VOL_HIGH_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="10 5 5 9 2 9 2 15 5 15 10 19 10 5"/><path d="M15 8.5a5 5 0 0 1 0 7"/><path d="M18 5a9 9 0 0 1 0 14"/></svg>`;
  const M_VOL_LOW_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="10 5 5 9 2 9 2 15 5 15 10 19 10 5"/><path d="M15 8.5a5 5 0 0 1 0 7"/></svg>`;
  const M_VOL_MUTE_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="10 5 5 9 2 9 2 15 5 15 10 19 10 5"/><line x1="17" y1="9" x2="22" y2="14"/><line x1="22" y1="9" x2="17" y2="14"/></svg>`;

  function volIconSvg(v) {
    return v === 0 ? M_VOL_MUTE_SVG : v < 0.5 ? M_VOL_LOW_SVG : M_VOL_HIGH_SVG;
  }

  // Scrolls the now-playing title only when it doesn't fit; pauses on hover.
  function setupMusicMarquee(text) {
    const mq = document.getElementById("musicMq");
    if (!mq) return;
    mq.classList.remove("scroll");
    mq.innerHTML = `<span class="m-mq-inner">${esc(text)}</span>`;
    requestAnimationFrame(() => {
      const inner = mq.querySelector(".m-mq-inner");
      if (!inner || inner.scrollWidth <= mq.clientWidth) return;
      inner.innerHTML = `<span>${esc(text)}</span><span class="m-mq-gap"></span><span>${esc(text)}</span>`;
      const dist = inner.firstElementChild.scrollWidth + 36;
      inner.style.setProperty("--mq-dist", `${dist}px`);
      inner.style.animationDuration = `${Math.max(6, dist / 26)}s`;
      mq.classList.add("scroll");
    });
  }

  function renderMusic(m) {
    if (!window.Music?.GENRES) return;
    // Cached so the track-details modal — opened by a click, not a music
    // state push — has something to render from whenever it's opened.
    state.lastMusic = m;
    const options = Object.entries(window.Music.GENRES).map(([key, value]) => `<option value="${key}" ${key === m.genre ? "selected" : ""}>${value.label}</option>`).join("");
    const stateName = m.loading ? "loading" : m.playing ? "playing" : "idle";
    const name = m.loading ? "Finding tracks…" : (m.playing || (m.name && m.name !== "Focus music")) ? m.name : "Not playing";
    const urls = m.artworkUrls || [];
    // Real cover art in place of the generic note glyph when we have one —
    // an <img> (not a background-image) so a failed load can fall through
    // the mirror list wired up below, same reasoning as the track-details
    // modal (Audius content nodes can be down/slow/rate-limiting).
    const noteHtml = urls.length
      ? `<img class="m-note m-art" src="${esc(urls[0])}" data-action="openTrackDetail" title="Track details">`
      : `<span class="m-note">${M_NOTE_SVG}</span>`;
    document.getElementById("music").innerHTML = `<div class="music ${stateName}">
      ${noteHtml}
      <div class="m-mq" id="musicMq" data-action="openTrackDetail" title="Track details"></div>
      <label class="m-genre" title="Change vibe">
        <select data-action="musicSetGenre">${options}</select>
        <span class="m-genre-dot"></span>
      </label>
      <button class="m-next" title="Next track" data-action="musicNext">${M_SKIP_SVG}</button>
      <div class="m-vol" title="Volume">
        <span class="m-vol-ic">${volIconSvg(m.volume)}</span>
        <input class="vol" type="range" min="0" max="1" step="0.05" value="${m.volume}" oninput="window.Music.setVolume(this.value)">
      </div>
    </div>`;
    setupMusicMarquee(name);

    const artEl = document.querySelector("#music img.m-art");
    if (artEl) {
      let i = 1;
      artEl.onerror = () => {
        if (i < urls.length) {
          artEl.src = urls[i];
          i++;
        } else {
          const fallback = document.createElement("span");
          fallback.className = "m-note";
          fallback.innerHTML = M_NOTE_SVG;
          artEl.replaceWith(fallback);
        }
      };
    }
  }

  // "Now Playing" track-details modal — artwork, artist, and a link to the
  // track on Audius, from clicking the scrolling title. Reuses the same
  // .top/.art/.m/.body/.close modal vocabulary as the task-detail dialog.
  function openTrackDetail() {
    document.getElementById("trkoverlay").classList.add("show");
    renderTrackDetail();
  }

  function closeTrackDetail() {
    document.getElementById("trkoverlay").classList.remove("show");
  }

  function renderTrackDetail() {
    const m = state.lastMusic;
    const urls = (m && m.artworkUrls) || [];
    const hasTrack = m && (m.title || urls.length || m.permalink);
    // A plain <img src> (not a CSS background-image) so a failed load can
    // actually be caught and retried against the next mirror — Audius is a
    // decentralized network, so any single content node's URL can be down,
    // slow, or rate-limiting hotlinks. See music.js's artworkUrls().
    const art = urls.length
      ? `<img class="art" src="${esc(urls[0])}">`
      : `<div class="art" style="background:linear-gradient(135deg,var(--green),#0a5)">♪</div>`;
    document.getElementById("trkmodal").className = "modal track-modal";
    document.getElementById("trkmodal").innerHTML = `
      <div class="top">${art}
        <div><h2>${esc((m && m.title) || "Focus music")}</h2>
          <div class="m">${m && m.artist ? esc(m.artist) : "—"}${m && m.genreLabel ? " · " + esc(m.genreLabel) : ""}</div>
        </div>
        <button class="close" data-action="closeTrackDetail">×</button></div>
      <div class="body">
        ${hasTrack && m.permalink
          ? `<button class="pill" data-action="openTrackLink" data-value="${esc(m.permalink)}">↗ View on Audius</button>`
          : `<div class="hint">${hasTrack ? "This track has no page on Audius." : "Nothing playing yet — start a task to hear some focus music."}</div>`}
      </div>`;

    const artEl = document.querySelector("#trkmodal img.art");
    if (artEl) {
      let i = 1;
      artEl.onerror = () => {
        if (i < urls.length) {
          artEl.src = urls[i];
          i++;
        } else {
          // Every mirror failed — drop back to the plain glyph tile instead
          // of leaving a broken-image icon in the modal.
          const fallback = document.createElement("div");
          fallback.className = "art";
          fallback.style.background = "linear-gradient(135deg,var(--green),#0a5)";
          fallback.textContent = "♪";
          artEl.replaceWith(fallback);
        }
      };
    }
  }

  function syncMusic() {
    if (!state.S) return;
    const phase = state.S.run.phase ?? null;
    const taskId = state.S.run.activeTaskId ?? null;

    // Cross-device (see docs/session-sync-design.md): another device's
    // session shouldn't drive local focus music — that's a real focus aid
    // meant to accompany *this* device actually working, not ambient noise
    // that starts playing here just because someone else, elsewhere, is
    // deep-working. Treat a mirrored session as idle for music purposes
    // only. The real phase/taskId still drive transition bookkeeping.
    const isMine = !state.S.run.deviceId || state.S.run.deviceId === state.S.deviceId;
    const musicPhase = isMine ? phase : null;
    const musicTaskId = isMine ? taskId : null;

    // Switching directly from one task to another (still "work" the whole
    // time — the timer never passes through idle/break in between, see
    // timer::play's single-active-task invariant) doesn't change phase, so
    // it wouldn't otherwise be noticed here. Treat it as "new song": skip to
    // the next track instead of just letting the old one keep playing under
    // a different task.
    if (musicPhase === "work" && state.lastMusicPhase === "work" && musicTaskId !== state.lastMusicTaskId) {
      window.Music.next();
    } else if (musicPhase !== state.lastMusicPhase) {
      window.Music.setActive(musicPhase === "work");
    }
    state.lastMusicPhase = musicPhase;
    state.lastMusicTaskId = musicTaskId;

    state.lastPhase = phase;
    state.lastTaskId = taskId;
  }

  return Object.assign(api, {
    render,
    navigate,
    goBack,
    goForward,
    goHome,
    performSearch,
    searchGoList,
    searchGoTask,
    clearSearch,
    openSettingsPage,
    openInsightsPage,
    openNowPlaying,
    toggleCompleted,
    openRowMenu,
    rowMenu,
    closeRowMenu,
    openDetail,
    openCreateDetail,
    closeDetail,
    renderDetail,
    openLyrics,
    closeLyrics,
    renderLyrics,
    renderSettingsPage,
    renderInsightsPage,
    toggleSessionGroup,
    setInsightsPeriod,
    renderHomePage,
    selectGridCell,
    renderMusic,
    openTrackDetail,
    closeTrackDetail,
    renderTrackDetail,
    syncMusic,
    renderTopbar,
    renderPinnedNav,
    renderSidebar,
    toggleAreaSection,
    toggleAllAreaSections,
    expandAreaSection,
    toggleLifeAgainst,
    selectAgainstArea,
    toggleKeybindings,
    renderMain,
    renderPlayer,
    sessionControlsHtml,
    sameRoute,
    applyRoute,
    animatePage,
    dayLabel,
    lyrBtn,
  });
}
