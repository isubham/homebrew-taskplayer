import {
  esc, fmt, fmtLong, fmtEst, fmtHM, whenLabel, timeAgo, buildCapacityBar, albumColor, LIFE_AREAS,
  IMPACT_TIERS, IMPACT_TIER_KEYS, jewelPayout, deadlineDate, toDateInputValue,
} from "./utils.js";
import { html, render as litRender } from "../vendor/lit-html.js";
import { NOW_ITEMS_SIZE, RECENT_TASKS_SIZE } from "./constants.js";

export function createRenderer({ state, helpers, actions }) {
  const { list, activeList, findTask, tasksForList, taskSessions, taskTotal, listTotal, listEstimateTotal, targetMs, modeLabel, modeGlyph } = helpers;

  // "12h 15m" -> "12h 15m of 20h" when an estimate total is known, otherwise
  // just the plain time — shared by the artist header, sidebar row, and
  // album sub-line so "spent of estimate" reads the same everywhere.
  const withEst = (timeText, estimateMin) => (estimateMin ? `${timeText} of ${fmtEst(estimateMin)}` : timeText);
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

  // Six-dot drag handle — the classic, instantly-recognizable "grab here" glyph.
  const GRIP_SVG = `<svg viewBox="0 0 10 16" width="8" height="14" fill="currentColor"><circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/><circle cx="2" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="2" cy="14" r="1.3"/><circle cx="8" cy="14" r="1.3"/></svg>`;
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

  // Feather's "settings" gear — the topbar's lone icon-cluster button (see
  // renderTopbar). Same stroke-based family as INSIGHTS_SVG above (used for
  // Insights as a pinned sidebar row — see renderPinnedNav), so they still
  // read as one icon language even though they don't live in the same
  // cluster.
  const GEAR_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

  // Same house glyph as the topbar's #tbhome button (index.html), sized to
  // the 15px sidebar-icon-column convention — used as the Home page's own
  // stickybar icon so it reads like the other pages' mini-headers.
  const HOME_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></svg>`;

  // Folder glyph for the sidebar's life-area section headers — frames each
  // area as a playlist folder (a Spotify concept) rather than a generic
  // productivity section, keeping the music-library metaphor intact while the
  // lists inside stay grouped. Tinted the area's color inline (this icon is
  // the one place the area color lives now — the old body spine is gone), so
  // color belongs to the category's own mark rather than a separate bar.
  const FOLDER_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

  // Spotify/Apple-Music-style sticky mini-header — sits above every .hdr
  // as #main's first child (see the 4 page renderers below), always
  // `position:sticky;top:0` (see CSS) but invisible at rest. It only fades
  // in once the big header's own <h1> — the "artist name" — scrolls out of
  // view; initStickyHeader() below is what watches for that.
  const stickyBarHtml = (icon, name, playAction) => `
    <div class="stickybar" id="stickybar">
      <span class="sb-icon">${icon}</span>
      <span class="sb-name">${name}</span>
      ${playAction ? `<button class="sb-play" data-action="${playAction}" title="Play first task">▶</button>` : ""}
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
    icons.innerHTML = `
      <button class="${state.view === "settings" ? "active" : ""}" data-action="openSettingsPage" title="Settings">${GEAR_SVG}</button>`;
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
    nav.innerHTML = `
      <div class="list-item ${state.view === "insights" ? "active" : ""}" data-action="openInsightsPage" title="Session history &amp; analytics">
        <span class="li-icon">${INSIGHTS_SVG}</span><span class="li-label">Insights</span>
      </div>`;
  }

  // One list row — count replaces the old two-line "N tasks · spent of
  // estimate" meta text, which moves into the row's title tooltip instead of
  // being always-on. `.list-grip` is positioned absolute (see CSS) precisely
  // so it doesn't reserve flex space and shift list rows' `.li-icon` out of
  // alignment with each other.
  function sidebarListRow(listItem) {
    const count = tasksForList(listItem.id).length;
    const detail = `${count} task${count === 1 ? "" : "s"} · ${withEst(fmtLong(listTotal(listItem.id)), listEstimateTotal(listItem.id))} — drag to reorder or onto a section, double-click to edit`;
    const isActive = state.view === "tasks" && listItem.id === state.activeListId;
    return `
      <div class="list-item ${isActive ? "active" : ""}" draggable="true" data-drag-list-id="${listItem.id}" data-action="selectList" data-id="${listItem.id}" title="${esc(detail)}">
        <span class="list-grip" title="Drag to reorder">${GRIP_SVG}</span>
        <span class="li-icon">${listItem.emoji}</span>
        <span class="li-label">${esc(listItem.name)}</span>
        <span class="count">${count}</span>
        <button class="list-edit" title="Edit name, emoji &amp; color" data-action="editList" data-id="${listItem.id}" data-stop-propagation="true">✎</button>
      </div>`;
  }

  // Sidebar lists are grouped under their life area (the same tag that feeds
  // the Home radar), Slack-style: each area is a collapsible section header
  // with its lists nested below. This makes the life category the top of the
  // navigation hierarchy (area → list → album → task) without any new data —
  // it reuses the list's existing `lifeArea` tag. Design constraints from
  // CLAUDE.md: sections follow the canonical LIFE_AREAS order (never
  // user-sorted — rule 8), and untagged lists stay a valid state in a calm
  // "Unsorted" bucket rather than being nagged to file themselves (rule 8).
  // Dragging a list onto a header re-files it.
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
    const sections = [];
    for (const area of LIFE_AREAS) {
      const items = byArea.get(area.key) || [];
      sections.push({ key: area.key, dropArea: area.key, label: area.label, color: area.color, items });
    }
    const untagged = byArea.get("");
    if (untagged && untagged.length) {
      sections.push({ key: "__unsorted__", dropArea: "", label: "Unsorted", color: "var(--muted)", items: untagged });
    }

    document.getElementById("lists").innerHTML = sections.map((section) => {
      const collapsed = !!state.sidebarCollapsed[section.key];
      const n = section.items.length;
      const body = n
        ? section.items.map(sidebarListRow).join("")
        : `<button type="button" class="ls-invite" data-action="addListInArea" data-area="${esc(section.dropArea)}" title="Create the first list in ${esc(section.label)}">+ Start a list</button>`;
      return `
      <div class="list-section${collapsed ? " collapsed" : ""}">
        <div class="ls-header" data-action="toggleAreaSection" data-area="${section.key}" data-area-drop="${esc(section.dropArea)}" title="${esc(section.label)} — ${n} list${n === 1 ? "" : "s"}">
          <span class="ls-folder" style="color:${section.color}">${FOLDER_SVG}</span>
          <span class="ls-label">${esc(section.label)}</span>
          <span class="ls-chevron">${collapsed ? "▸" : "▾"}</span>
        </div>
        <div class="ls-body">${body}</div>
      </div>`;
    }).join("");
  }

  // Collapse/expand a sidebar life-area section (persisted, see state.js).
  function toggleAreaSection(key) {
    if (!key) return;
    state.sidebarCollapsed[key] = !state.sidebarCollapsed[key];
    try { localStorage.setItem("tp.sidebarCollapsed", JSON.stringify(state.sidebarCollapsed)); } catch (e) { /* non-fatal */ }
    renderSidebar();
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
  // the header wash, the big play button, the playing-row highlight, and
  // the toolbar's "Add task" pill hover all pick it up through CSS
  // `var(--accent, ...fallback)` rules — and so every other page (Settings,
  // Insights, Recent) automatically stays plain green, since none of those
  // set it. Hex + alpha-suffix strings (not `color-mix()`) to match how the
  // rest of the app already tints things — Big Sur's WebKit predates
  // `color-mix()` support.
  // `.play-all`'s glyph used to be a hardcoded black, safe when the button
  // was always the fixed Spotify green — now it's an arbitrary color from
  // the list's own picker (any hex the native color input allows, including
  // near-black), so black-on-black is a real possibility. WCAG relative
  // luminance decides black vs. white ink; this isn't chasing an exact
  // contrast ratio, just picking the readable side.
  function relativeLuminance(hex) {
    const clean = hex.replace("#", "");
    const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
    const n = parseInt(full, 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function setAccent(main, color) {
    main.style.setProperty("--accent", color);
    main.style.setProperty("--accent-soft", `${color}1f`);
    main.style.setProperty("--accent-softer", `${color}29`);
    // 0.179 isn't a round-number guess — it's the luminance where black-ink
    // and white-ink contrast ratios cross over (solving (L+.05)/.05 =
    // 1.05/(L+.05) against the WCAG formula), so this is the actual
    // higher-contrast pick either side of it, not an approximation. It also
    // happens to keep every existing PALETTE color (including the default
    // green) on black ink exactly as before — only genuinely dark custom
    // colors flip to white.
    main.style.setProperty("--accent-ink", relativeLuminance(color) > 0.179 ? "#000" : "#fff");
  }
  function clearAccent(main) {
    main.style.removeProperty("--accent");
    main.style.removeProperty("--accent-soft");
    main.style.removeProperty("--accent-softer");
    main.style.removeProperty("--accent-ink");
  }

  function renderMain() {
    if (!state.S) return;
    const main = document.getElementById("main");
    if (state.view === "home") { clearAccent(main); return renderHomePage(); }
    if (state.view === "settings") { clearAccent(main); return renderSettingsPage(); }
    if (state.view === "insights") { clearAccent(main); return renderInsightsPage(); }

    const listItem = activeList();
    if (!listItem) {
      clearAccent(main);
      main.innerHTML = `<div class="empty">Create a list to get started.</div>`;
      return;
    }
    setAccent(main, listItem.color);

    const all = tasksForList(listItem.id);
    const todo = all.filter((task) => !task.completedAt);
    const done = all.filter((task) => task.completedAt).sort((a, b) => b.completedAt - a.completedAt);

    const taskRow = (task, index) => {
      const active = state.S.run.activeTaskId === task.id && state.S.run.phase;
      const working = active && state.S.run.phase === "work" && state.S.run.runningStart;
      const onBreak = active && (state.S.run.phase === "break" || state.S.run.phase === "awaiting_break" || state.S.run.phase === "awaiting_work");
      // Active, but owned by another of this account's devices (see
      // docs/session-sync-design.md) — the row still highlights, but the
      // button can't offer to "pause" a session this device isn't actually
      // running; it offers to take over instead.
      const elsewhere = active && state.S.run.deviceId && state.S.deviceId && state.S.run.deviceId !== state.S.deviceId;

      // Total time + estimate live on the capacity bar (fill = total time,
      // "spent │ estimate" readout, calm blue once over) in its own
      // "Progress" column. How many sessions that total came from is a
      // separate "Sessions" column right before it — it used to be a corner
      // badge crammed onto the bar itself, competing with the readout;
      // splitting it out gives both their own quick-glance answer instead
      // of one crowded cell trying to answer two questions at once.
      const durations = taskSessions(task.id).map((session) => (session.end ?? Date.now()) - session.start);
      if (working) durations.push(Date.now() - state.S.run.runningStart);
      const bar = task.estimateMin ? buildCapacityBar(durations, task.estimateMin) : null;
      const sessionCount = bar ? bar.sessionCount : durations.length;
      const sessionsCell = sessionCount
        ? `<span class="sess-count" title="${bar ? bar.sessionLabel : sessionCount + " session" + (sessionCount === 1 ? "" : "s")} logged">${sessionCount}</span>`
        : `<span class="sess-count sess-count-empty" title="No sessions logged yet">–</span>`;
      const rbarline = onBreak
        ? `<span class="rbar-status">on break</span>`
        : bar
          ? bar.html
          : `<span class="rbar-status">${fmtHM(taskTotal(task.id))}</span>`;

      // Deterministic jewel payout (see utils.js's jewelPayout — never
      // randomized, so this preview is always exactly what completing the
      // task actually pays). null for a task with no impact tier set, which
      // renders nothing. Shown as that many literal jewels rather than a
      // single dot + numeral — "2 jewels" reads instantly as a count
      // without making the user parse a number, and since severe (weight 8)
      // is gone, high (weight 4) tops this out at 4 dots, still a glance.
      // Colored by the list's life area so what KIND of jewel it is is
      // legible without a hover, same as the rest of the app's color
      // language (see LIFE_AREAS) — a negative payout stays red regardless
      // of area, matching the existing "against" convention.
      const payout = jewelPayout(task);
      const payoutTitle = payout ? `${payout.amount > 0 ? "+" : ""}${payout.amount}` : "";
      const areaColor = listItem.lifeArea ? (LIFE_AREAS.find((a) => a.key === listItem.lifeArea) || {}).color : null;
      const jewelHtml = payout
        ? `<span class="jewel-group" title="${esc(payoutTitle)}">${Array.from({ length: Math.abs(payout.amount) }, () =>
            `<i class="jewel-dot${payout.amount < 0 ? " neg" : ""}"${payout.amount > 0 && areaColor ? ` style="background:${areaColor}"` : ""}></i>`
          ).join("")}</span>`
        : "";
      const playTitle = elsewhere
        ? `Playing on ${state.S.run.deviceName || "another device"} — click to play here`
        : `Click to ${active ? "stop" : "start"}${payoutTitle ? " — earns " + payoutTitle : ""}`;

      return `<tr class="${active ? "playing" : ""}" draggable="true" data-drag-id="${task.id}" data-list-id="${listItem.id}" data-album="${esc(task.album || "")}" title="Drag to reorder">
        <td class="idx">
          <span class="grip" title="Drag to reorder">${GRIP_SVG}</span>
          <span class="num">${working ? "♪" : onBreak ? "☕" : index + 1}</span><button class="go" data-action="play" data-id="${task.id}" data-stop-propagation="true" title="${esc(playTitle)}">${active && !elsewhere ? "⏸" : "▶"}</button>
        </td>
        <td class="tname">${esc(task.name)}${task.depth ? `<span class="tag ${task.depth}">${task.depth}</span>` : ""}${jewelHtml}</td>
        <td class="r sess-cell">${sessionsCell}</td>
        <td class="r bar-cell">${rbarline}</td>
        <td class="menu-cell"><button class="menu-btn" title="More" data-action="openRowMenu" data-id="${task.id}" data-stop-propagation="true">⋯</button></td>
      </tr>`;
    };

    // Shared column header for every album/singles table below — one
    // labeled row per section (not per page) so "Sessions" and "Progress"
    // are always named, never left to a bare number and an unlabeled bar to
    // explain themselves.
    const taskTheadHtml = `<thead><tr><th class="idx">#</th><th>Task</th><th class="r sess-cell">Sessions</th><th class="r">Progress</th><th class="menu-cell"></th></tr></thead>`;

    // Group the to-do list into album sections — related tasks sharing a
    // task.album value, in order of that album's first appearance, with
    // ungrouped tasks (no album) collected into a trailing "Singles"
    // section. Track numbering (the # column) restarts per section, like a
    // real album's track list.
    const albumOrder = [];
    const byAlbum = new Map();
    for (const task of todo) {
      const key = task.album || "";
      let bucket = byAlbum.get(key);
      if (!bucket) { bucket = []; byAlbum.set(key, bucket); albumOrder.push(key); }
      bucket.push(task);
    }
    const singles = byAlbum.get("") || [];
    const sections = albumOrder.filter((key) => key !== "").map((key) => {
      const tasks = byAlbum.get(key);
      const totalMs = tasks.reduce((sum, task) => sum + taskTotal(task.id), 0);
      const totalEst = tasks.reduce((sum, task) => sum + (task.estimateMin || 0), 0);
      const color = albumColor(key);
      return `<div class="albhead" data-album-drop="${esc(key)}" title="Drop a task here to add it to this album">
          <div class="alb-tile" style="background:${color}22;color:${color}">💿</div>
          <div class="alb-meta"><div class="alb-name">${esc(key)}</div><div class="alb-sub">${tasks.length} task${tasks.length === 1 ? "" : "s"} · ${withEst(fmtLong(totalMs), totalEst)}</div></div>
          <button class="alb-play" data-action="play" data-id="${tasks[0].id}" data-stop-propagation="true" title="Play first task in this album">▶</button>
        </div>
        <table class="albrows">${taskTheadHtml}<tbody>${tasks.map((task, i) => taskRow(task, i)).join("")}</tbody></table>`;
    }).join("");
    // Once at least one album exists, "Singles" is always shown (even
    // empty) so there's somewhere to drop a task to take it out of its
    // album — otherwise there'd be no valid drop target for that gesture.
    const singlesSection = sections
      ? `<div class="singles-tag" data-album-drop="" title="Drop a task here to remove it from its album">Singles</div>${
          singles.length
            ? `<table class="albrows">${taskTheadHtml}<tbody>${singles.map((task, i) => taskRow(task, i)).join("")}</tbody></table>`
            : `<div class="empty-singles" data-album-drop="">Drop a task here to remove it from its album</div>`
        }`
      : singles.length
        ? `<table class="albrows">${taskTheadHtml}<tbody>${singles.map((task, i) => taskRow(task, i)).join("")}</tbody></table>`
        : "";

    const doneRows = done.map((task) => `
      <div class="crow" data-action="openDetail" data-id="${task.id}">
        <button class="ccheck" title="Mark as not done" data-action="toggleDone" data-id="${task.id}" data-stop-propagation="true">✓</button>
        <span class="cname">${esc(task.name)}</span>
        <span class="ctime">${fmtHM(taskTotal(task.id))}</span>
        <button class="menu-btn" title="More" data-action="openRowMenu" data-id="${task.id}" data-stop-propagation="true">⋯</button>
      </div>`).join("");
    const completedGroup = done.length ? `
      <div class="cgroup ${state.completedOpen ? "open" : ""}">
        <div class="chead" data-action="toggleCompleted"><span class="chev">›</span> Completed · ${done.length}</div>
        <div class="clist">${doneRows}</div>
      </div>` : "";

    main.innerHTML = `
      ${stickyBarHtml(listItem.emoji, esc(listItem.name), "playFirst")}
      <div class="hdr" data-tauri-drag-region>
        <div class="cover" style="background:linear-gradient(135deg,${listItem.color},${listItem.color}55)">${listItem.emoji}</div>
        <div class="info"><small>Task List</small><h1>${esc(listItem.name)}</h1><div class="sub">${todo.length} to do${done.length ? " · " + done.length + " done" : ""} · ${withEst(fmtLong(listTotal(listItem.id)), listEstimateTotal(listItem.id))} tracked</div></div>
      </div>
      <div class="toolbar">
        <button class="play-all" data-action="playFirst" title="Play first task">▶</button>
        <button class="pill" data-action="addTask">＋ Add task</button>
      </div>
      ${todo.length ? `${sections}${singlesSection}`
        : `<div class="empty">${all.length ? "All done here. 🎉" : "No tasks yet. Click <b>Add task</b> to start."}</div>`}
      ${completedGroup}
      <p class="note">Only one task runs at a time. The menu-bar item shows live minutes and toggles play/pause.</p>`;
    initStickyHeader();
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
      litRender(html`<div class="art" style="background:${listItem.color}22;color:${listItem.color}">${listItem.emoji}</div><div><div class="t"><span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true" title="Go to ${listItem.name}">${task.name}</span></div><div class="l">Playing on ${esc(run.deviceName || "another device")}</div></div>`, np);
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

    litRender(html`<div class="art" style="background:${listItem.color}22;color:${listItem.color}">${listItem.emoji}</div><div><div class="t"><span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true" title="Go to ${listItem.name}">${task.name}</span></div><div class="l"><span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true">${listItem.name}</span>${running ? "" : " · paused"}</div></div>`, np);

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

    // Work block just ended (already logged) — the break clock doesn't start
    // on its own. This big button *is* the "click the notification" gesture:
    // macOS notification clicks aren't reliably wired to the app, so the
    // window surfaces itself (see surface_main_window in main.rs) with this
    // button already showing. Every Nth work block earns a longer break
    // (see run.longBreak, set by the backend's timer::tick) — the button and
    // status label call that out explicitly rather than showing an identical
    // "Start break" for a 5m and a 20m break.
    if (run.phase === "awaiting_break") {
      const breakLen = run.longBreak ? state.S.config.longBreakMin : state.S.config.breakMin;
      const btnLabel = run.longBreak ? `Long break ☕☕ — ${breakLen}m` : `Break ☕ — ${breakLen}m`;
      litRender(html`<div class="controls">${badge}<button class="bigaction" data-action="startBreak" title="Start break" style="background:var(--blue)">${btnLabel}</button><button class="stopbtn" data-action="stop">■ End</button>${lyrBtn(task.id)}</div>
        <div class="timeline"><span class="clock" style="color:var(--blue)">Work session done</span><div class="bar brk"><span style="width:100%"></span></div><span class="clock" style="color:var(--blue)">waiting</span></div>`, center);
      return;
    }

    // Break just ended — same idea in reverse: work only resumes once
    // clicked, never automatically.
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
    document.getElementById("app")?.classList.toggle("rail", state.railOpen);
    document.getElementById("railtoggle")?.classList.toggle("on", state.railOpen);
    renderNowPlaying();
  }

  function toggleRail() {
    state.railOpen = !state.railOpen;
    localStorage.setItem("tp.rail", state.railOpen ? "1" : "0");
    render();
  }

  const sameRoute = (a, b) => a.view === b.view && (a.listId || null) === (b.listId || null);

  function applyRoute() {
    state.view = state.route.view;
    if (state.route.view === "tasks" && state.route.listId && list(state.route.listId)) {
      state.activeListId = state.route.listId;
    }
    render();
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
    state.navBack.push(state.route);
    state.navFwd.length = 0;
    state.route = next;
    applyRoute();
  }

  function goBack() {
    if (!state.navBack.length) return;
    state.navFwd.push(state.route);
    state.route = state.navBack.pop();
    applyRoute();
  }

  function goForward() {
    if (!state.navFwd.length) return;
    state.navBack.push(state.route);
    state.route = state.navFwd.pop();
    applyRoute();
  }

  function openSettingsPage() {
    navigate({ view: "settings", listId: null });
  }

  function openInsightsPage() {
    navigate({ view: "insights", listId: null });
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

  function toggleCompleted() {
    state.completedOpen = !state.completedOpen;
    renderMain();
  }

  function playFirst() {
    // Mirrors renderMain's album grouping: named-album tasks (in the order
    // their album first appears) come before ungrouped "singles" ones, so
    // "play first task" always starts whichever row renders first on screen.
    const todo = tasksForList(activeList().id).filter((item) => !item.completedAt);
    const albumOrder = [];
    const byAlbum = new Map();
    for (const item of todo) {
      const key = item.album || "";
      let bucket = byAlbum.get(key);
      if (!bucket) { bucket = []; byAlbum.set(key, bucket); albumOrder.push(key); }
      bucket.push(item);
    }
    const ordered = [...albumOrder.filter((key) => key !== ""), ...(byAlbum.has("") ? [""] : [])].flatMap((key) => byAlbum.get(key));
    if (ordered.length) dispatch("play", { id: ordered[0].id });
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
    const dotsHtml = Array.from({ length: Math.abs(payout.amount) }, () =>
      `<i class="jewel-dot${payout.amount < 0 ? " neg" : ""}"${payout.amount > 0 && area ? ` style="background:${area.color}"` : ""}></i>`
    ).join("");
    const payoutHtml = `<div class="payout-preview">Earns on completion: <span class="amt">${dotsHtml}<b>${payout.amount > 0 ? "+" : ""}${payout.amount}</b>${area ? " " + esc(area.label) : ""}</span></div>`;

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
  // Now Playing rail — not something this panel needs to duplicate. What's
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

  function renderDetail() {
    if (!state.S) return;
    const task = findTask(state.openTaskId);
    if (!task) {
      closeDetail();
      return;
    }
    const listItem = list(task.listId);
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
    const sessTotalHtml = `<div class="det-total">${fmt(taskTotal(task.id))} <span class="of">of</span> <button class="est-step" data-action="decreaseEstimate" data-id="${task.id}" title="Decrease estimate by 1h">−</button><input class="est-inline" type="number" min="0" max="1000" step="0.25" placeholder="—" value="${estimateValue}" data-action="setEstimateInline" data-id="${task.id}"><button class="est-step" data-action="bumpEstimate" data-id="${task.id}" title="Increase estimate by 1h">+</button>h <span class="dot">·</span> ${sessionCount} session${sessionCount === 1 ? "" : "s"}</div>`;

    document.getElementById("modal").innerHTML = `
      <div class="top"><div class="art" style="background:linear-gradient(135deg,${listItem.color},${listItem.color}55)">${listItem.emoji}</div>
        <div><h2><span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true" title="Go to ${esc(listItem.name)}">${esc(task.name)}</span> <button class="editbtn" title="Rename" data-action="renameTask" data-id="${task.id}">${DETAIL_PENCIL_ICON}</button></h2>
        </div>
        <button class="close" data-action="closeDetail">×</button></div>
      <div class="body">
        <h4 class="lyr-h">♪ Notes</h4>
        <textarea class="lyrics-inline" data-action="setLyricsInline" data-id="${task.id}" placeholder="What will finishing this feel like? Add the goal, a note, a link…" rows="3">${esc(task.description || "")}</textarea>
        <h4>Depth</h4>
        ${depthSegHtml}
        <h4>Deadline</h4>
        <input class="deadline-input" type="date" value="${task.deadlineAt ? toDateInputValue(task.deadlineAt) : ""}" data-action="setDeadlineInline" data-id="${task.id}">
        ${renderImpactSection(task)}
        <h4>List</h4>
        ${listSelectHtml}
        <div class="sh"><h4>Sessions</h4><button class="linkbtn blue" data-action="addSession" data-id="${task.id}">＋ Add session</button></div>
        ${sessTotalHtml}
        ${rows}
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

  function renderNowPlaying() {
    if (!state.S) return;
    const rail = document.getElementById("nprail");
    if (!rail || !state.railOpen) return;
    const run = state.S.run;
    const running = run.activeTaskId && run.phase ? findTask(run.activeTaskId) : null;
    let task = running || (run.lastTaskId ? findTask(run.lastTaskId) : null);
    if (!running && task && task.completedAt) task = null;
    const listItem = task ? list(task.listId) : null;
    if (!task || !listItem) {
      rail.innerHTML = `<div class="lab">Now playing</div>
        <div class="np-empty"><div class="np-art idle">▤</div><p>Nothing playing.<br>Press ▶ on a task to start.</p></div>`;
      return;
    }

    const status = !running
      ? "paused"
      : run.phase === "break"
        ? (run.longBreak ? "on long break" : "on break")
        : run.phase === "awaiting_break"
          ? (run.longBreak ? "long break time — waiting to start" : "break time — waiting to start")
          : run.phase === "awaiting_work"
            ? "back to work — waiting to start"
            : "recording…";
    const description = (task.description || "").trim();
    let entries = taskSessions(task.id).map((session) => ({ start: session.start, end: session.end }));
    if (running && run.phase === "work" && run.runningStart) entries.push({ start: run.runningStart, end: null, live: true });
    entries.sort((a, b) => b.start - a.start);
    const now = Date.now();
    // Capped at 3, not 6 — this rail is a glance, not a log to scroll (see
    // docs/adhd-design-principles.md, rule 5: the reward-check surface has
    // to stay quick, never grow into its own browsable destination). Full
    // history already has a real home on the Insights page; this just
    // points there once there's more than fits.
    const sessions = entries.slice(0, 3).map((entry) => `<div class="ses"><span class="w">${whenLabel(entry.start)}${entry.live ? " · now" : ""}</span><span class="d">${fmt((entry.end ?? now) - entry.start)}</span></div>`).join("") || `<div class="ses"><span class="w">No sessions yet</span></div>`;
    const moreSessionsLink = entries.length > 3
      ? `<button class="linkbtn" data-action="openInsightsPage">All sessions</button>`
      : "";

    rail.innerHTML = `
      <div class="lab">Now playing</div>
      <div class="np-card np-info">
        <div class="np-art" style="background:linear-gradient(135deg,${listItem.color},${listItem.color}88)">${listItem.emoji}</div>
        <h2><span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true" title="Go to ${esc(listItem.name)}">${esc(task.name)}</span></h2>
        <div class="m"><span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true">${esc(listItem.name)}</span> · ${status}${task.estimateMin ? " · est " + fmtEst(task.estimateMin) : ""}</div>
        ${running ? `<div class="acts"><button class="donebtn" data-action="toggleDone" data-id="${task.id}">✓ Mark as done</button></div>` : ""}
      </div>
      <div class="np-card">
        <h4>♪ Lyrics <button class="linkbtn" data-action="editLyrics" data-id="${task.id}">${description ? "Edit" : "＋ Add"}</button></h4>
        ${description ? `<div class="lyrics">${esc(description)}</div>` : `<div class="lyrics empty" data-action="editLyrics" data-id="${task.id}">What will finishing this feel like? Add the goal, a note…</div>`}
      </div>
      <div class="np-card"><h4>Recent sessions ${moreSessionsLink}</h4>${sessions}</div>`;
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
  // Only Pomodoro mode ever fires a notification (see the tick loop in
  // main.rs), so Open/Target mode shows an explanatory note instead of an
  // empty-looking sound-picker block.
  function notificationsSectionHtml() {
    const config = state.S.config;
    if (config.mode !== "pomodoro") {
      return `<p class="hint" style="margin-top:0">Notifications play at the end of a work block or break — only in 🍅 Pomodoro mode (see Workflow above). Switch modes to enable them.</p>`;
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
      ${config.mode === "target" ? `<h4>Target length</h4><div class="fld"><input type="number" min="1" max="240" value="${config.targetMin}" data-action="setConfigField" data-key="targetMin"> minutes</div><p class="hint">The bar fills toward your target and pulses when reached; it keeps counting if you go over.</p>` : ""}
      ${config.mode === "pomodoro" ? `<h4>Work / break lengths</h4><div class="fld"><input type="number" min="1" max="120" value="${config.workMin}" data-action="setConfigField" data-key="workMin"> min work</div><div class="fld"><input type="number" min="1" max="60" value="${config.breakMin}" data-action="setConfigField" data-key="breakMin"> min break</div><p class="hint">Work blocks auto-log; music pauses on breaks and resumes on work. Classic is 25 / 5.</p>
        <h4>Long break</h4><div class="fld"><input type="number" min="1" max="12" value="${config.cyclesBeforeLongBreak}" data-action="setConfigField" data-key="cyclesBeforeLongBreak"> cycles before a long break</div><div class="fld"><input type="number" min="1" max="60" value="${config.longBreakMin}" data-action="setConfigField" data-key="longBreakMin"> min long break</div><p class="hint">Every Nth break is longer, so a full set of work blocks ends in real recovery. Classic is every 4th, 20 min.</p>` : ""}
      ${config.mode === "open" ? `<p class="hint">The classic stopwatch — runs until you press stop.</p>` : ""}`;
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
        const ruler = buildTrackAndRuler(group.items, dayStart.getTime(), 86400000, 3600000, 900000,
          ["12a", "6a", "12p", "6p", "12a"], group.key === todayKey);
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

    document.getElementById("main").innerHTML = `
      ${stickyBarHtml(INSIGHTS_SVG, "Insights")}
      <div class="hdr" data-tauri-drag-region>
        <div class="cover" style="background:linear-gradient(135deg,#2e7d4f,#0c3f26)">${INSIGHTS_SVG_HERO}</div>
        <div class="info"><small>History</small><h1>Insights</h1><div class="sub">${items.length} session${items.length === 1 ? "" : "s"} across all tasks</div></div>
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

  // "What should I be doing now" — the Home page's "Now" section (see
  // docs/homepage-now-spec.md). Distinct from recentTasks above: that
  // surfaces what WAS played; this surfaces what's being avoided — tagged as
  // mattering (impactTier medium/high), carrying a deadline, and left
  // untouched while that deadline closes in. Three named, boundable factors
  // (impact weight, urgency, neglect) rather than a black-box score, so a
  // card's reason for showing is always explainable in one sentence rather
  // than a number nobody could reconstruct.
  function nowCandidates(limit = 3) {
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

  // Same idea as recentTasks() but rolled up to the list level: last-active
  // timestamp per list (from its tasks' sessions, or "now" if one of its
  // tasks is the live running one), most-recent first. A brand-new
  // workspace has no session history yet, so any remaining slots are padded
  // out with the rest of the lists in their normal order rather than
  // leaving the section looking broken/empty.
  function recentLists(limit = 3) {
    if (!state.S) return [];
    const now = Date.now();
    const lastByList = new Map();
    for (const session of state.S.sessions) {
      const task = findTask(session.taskId);
      if (!task) continue;
      const at = session.end ?? now;
      if (!lastByList.has(task.listId) || at > lastByList.get(task.listId)) {
        lastByList.set(task.listId, at);
      }
    }
    const run = state.S.run;
    if (run.activeTaskId && run.phase === "work" && run.runningStart) {
      const activeTask = findTask(run.activeTaskId);
      if (activeTask) lastByList.set(activeTask.listId, now);
    }
    const ranked = Array.from(lastByList.entries())
      .map(([listId, at]) => ({ listItem: list(listId), at }))
      .filter((entry) => entry.listItem)
      .sort((a, b) => b.at - a.at)
      .map((entry) => entry.listItem);
    if (ranked.length >= limit) return ranked.slice(0, limit);
    const seen = new Set(ranked.map((listItem) => listItem.id));
    const rest = state.S.lists.filter((listItem) => !seen.has(listItem.id));
    return [...ranked, ...rest].slice(0, limit);
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
  // four at-a-glance stats, the life-balance radar (lifeBalanceScores()/
  // buildLifeRadar() above — now itself weighted by impact tier, see that
  // function's comment), a "Jump back in" row of recentTasks() as cards,
  // and the 3 lists worked in most recently (recentLists() above) — not
  // every list, so the page stays a quick "pick up where you left off"
  // glance rather than a second copy of the sidebar. Reuses the standard
  // .hdr/.cover/.info header component (clearAccent() below keeps it on the
  // plain grey wash, same as Settings/Insights) so it gets the same drag region,
  // gradient and sticky mini-header behavior as every other page for free.
  // This page used to also carry a separate "Impact & progress" section
  // (mana bar, per-area vitality rings, a rank ladder card) — cut; see
  // utils.js's comment for why. The radar above is now the one place impact
  // shows up on Home.
  // Row markup for the Home page's "Now" section — see nowCandidates() above
  // and docs/homepage-now-spec.md. Deliberately built from the same row
  // vocabulary as the to-do list's taskRow (.idx num→▶-on-hover, .tname +
  // .jewel-group, right-aligned bar cell) so a Now item reads as the same
  // kind of thing as a task in a list, not a separate bespoke card. The one
  // Now-specific column is the deadline: a filling bar (physical time cue,
  // ADHD rule 3) next to an exact "due <date>" (deadlineDate). Bar fill
  // reuses nowCandidates' own urgency formula (0 = a week+ out, 1 =
  // due/overdue) so a row further along the bar is exactly the one
  // nowCandidates ranked as more urgent. Jewel dots reuse jewelPayout()'s
  // markup — no new reward mechanism, the same deterministic, disclosed one.
  function nowRowHtml(task, index) {
    const listItem = list(task.listId);
    const now = Date.now();
    const daysLeft = (task.deadlineAt - now) / 86400000;
    const pct = Math.round(Math.max(0, Math.min(1, 1 - daysLeft / 7)) * 100);
    const payout = jewelPayout(task);
    const payoutTitle = payout ? `${payout.amount > 0 ? "+" : ""}${payout.amount}` : "";
    const areaColor = listItem && listItem.lifeArea ? (LIFE_AREAS.find((a) => a.key === listItem.lifeArea) || {}).color : null;
    const jewelHtml = payout
      ? `<span class="jewel-group" title="${esc(payoutTitle)}">${Array.from({ length: Math.abs(payout.amount) }, () =>
          `<i class="jewel-dot${payout.amount < 0 ? " neg" : ""}"${payout.amount > 0 && areaColor ? ` style="background:${areaColor}"` : ""}></i>`
        ).join("")}</span>`
      : "";
    return `<tr data-action="searchGoTask" data-id="${task.id}" title="Open ${esc(task.name)}">
      <td class="idx">
        <span class="num">${index + 1}</span><button class="go" data-action="play" data-id="${task.id}" data-stop-propagation="true" title="Click to start${payoutTitle ? " — earns " + payoutTitle : ""}">▶</button>
      </td>
      <td class="tname">${esc(task.name)}${task.depth ? `<span class="tag ${task.depth}">${task.depth}</span>` : ""}${jewelHtml}</td>
      <td class="r due-cell">
        <span class="now-bar"><span class="now-bar-fill" style="width:${pct}%"></span></span>
        <span class="now-due">${deadlineDate(task.deadlineAt, now)}</span>
      </td>
    </tr>`;
  }

  function renderHomePage() {
    if (!state.S) return;
    const radarScores = lifeBalanceScores();
    const hasLifeTags = state.S.lists.some((listItem) => listItem.lifeArea);
    const hasAgainst = radarScores.some((s) => s.negPct > 0);
    const againstOn = state.lifeBalanceAgainst;
    const nowTasks = nowCandidates(NOW_ITEMS_SIZE);
    const nowHtml = nowTasks.length
      ? `<table class="albrows now-table"><tbody>${nowTasks.map((task, i) => nowRowHtml(task, i)).join("")}</tbody></table>`
      : `<div class="home-empty">Nothing needs attention right now.</div>`;
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

    const recentListItems = recentLists(3);
    const listsHtml = recentListItems.length
      ? recentListItems.map((listItem) => {
          const openCount = tasksForList(listItem.id).filter((task) => !task.completedAt).length;
          return `<div class="hl-card" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}">
            <span class="hl-tile" style="background:${listItem.color}22;color:${listItem.color}">${listItem.emoji}</span>
            <div class="hl-name">${esc(listItem.name)}</div>
            <div class="hl-meta">${openCount} open · ${fmtHM(listTotal(listItem.id))}</div>
          </div>`;
        }).join("")
      : `<div class="home-empty">Create a list to get started.</div>`;

    const todayMs = todayTotalMs();
    const allMs = state.S.lists.reduce((sum, listItem) => sum + listTotal(listItem.id), 0);
    const doneCount = state.S.tasks.filter((task) => task.completedAt).length;

    document.getElementById("main").innerHTML = `
      ${stickyBarHtml(HOME_SVG, "Home")}
      <div class="hdr" data-tauri-drag-region>
        <div class="cover" style="background:linear-gradient(135deg,#3a3a3a,#1c1c1c)">${greetingEmoji()}</div>
        <div class="info"><small>${esc(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</small><h1>${greeting()}</h1><div class="sub">${fmtHM(todayMs)} tracked today</div></div>
      </div>
      <div class="home-body">
        <div class="home-stats">
          <div class="hs-stat"><div class="hs-num">${fmtHM(todayMs)}</div><div class="hs-label">Today</div></div>
          <div class="hs-stat"><div class="hs-num">${fmtHM(allMs)}</div><div class="hs-label">All time</div></div>
          <div class="hs-stat"><div class="hs-num">${doneCount}</div><div class="hs-label">Completed</div></div>
          <div class="hs-stat"><div class="hs-num">${state.S.lists.length}</div><div class="hs-label">Lists</div></div>
        </div>
        <section class="home-section">
          <h4>Needs attention</h4>
          ${nowHtml}
        </section>
        <section class="home-section">
          <h4>Life balance <span class="home-sub-note">· last 7 days</span>${hasLifeTags && hasAgainst ? `<button class="home-toggle" data-action="toggleLifeAgainst">${againstOn ? "Hide what's pulling against" : "Show what's pulling against"}</button>` : ""}</h4>
          ${hasLifeTags
            ? `<div class="home-radar">${buildLifeRadar(radarScores, { against: againstOn, selectedAgainst: againstOn ? selectedAgainstArea : null })}</div>${againstOn && hasAgainst ? `<div class="radar-legend"><span class="rl-swatch"></span>Time pulling against your areas · last 7 days · tap a grey dot for detail</div>` : ""}${againstOn && selectedAgainstArea ? `<div class="against-detail-wrap">${buildAgainstDetail(selectedAgainstArea)}</div>` : ""}${buildLifeBalanceGrid()}`
            : `<div class="home-empty">Tag a list with a life area (Edit list, or when creating a new one) to see your balance here.</div>`}
        </section>
        <section class="home-section">
          <h4>Jump back in</h4>
          <div class="jb-grid">${jumpHtml}</div>
        </section>
        <section class="home-section">
          <h4>Recent lists</h4>
          <div class="hl-grid">${listsHtml}</div>
        </section>
      </div>`;
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
    // only — the real phase/taskId (below) still drives the rail-auto-open
    // and lastPhase/lastTaskId bookkeeping regardless of ownership, since
    // "something's playing, worth surfacing" is still true either way.
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

    // Work just started (from idle, paused, break, or a cross-device
    // takeover — anything that wasn't already "work") — reveal the Now
    // Playing rail automatically, Spotify-style, instead of leaving it
    // closed until the user remembers to toggle it open themselves. Uses
    // the real (unfiltered) phase — awareness that something's playing is
    // still useful even when it's mirroring another device. Doesn't force
    // it shut again on stop/break — only the user's own toggle does that.
    if (phase === "work" && state.lastPhase !== "work" && !state.railOpen) {
      state.railOpen = true;
      localStorage.setItem("tp.rail", "1");
    }
    state.lastPhase = phase;
    state.lastTaskId = taskId;
  }

  return Object.assign(api, {
    render,
    toggleRail,
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
    toggleCompleted,
    playFirst,
    openRowMenu,
    rowMenu,
    closeRowMenu,
    openDetail,
    closeDetail,
    renderDetail,
    openLyrics,
    closeLyrics,
    renderLyrics,
    renderNowPlaying,
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
