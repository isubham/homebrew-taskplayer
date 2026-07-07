import { esc, fmt, fmtLong, fmtEst, fmtHM, estPct, whenLabel, timeAgo, buildCapacityBar, albumColor } from "./utils.js";
import { html, render as litRender } from "../vendor/lit-html.js";

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

  const CLOCK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;

  function renderSidebar() {
    if (!state.S) return;
    document.getElementById("recentNav").innerHTML = `
      <div class="list-item recent-item ${state.view === "recent" ? "active" : ""}" data-action="openRecentPage" title="Last 6 tasks played">
        <span class="sq">${CLOCK_SVG}</span>
        <span class="meta"><span>Recent</span></span>
      </div>`;
    document.getElementById("lists").innerHTML = state.S.lists.map((listItem) => `
      <div class="list-item ${state.view === "tasks" && listItem.id === state.activeListId ? "active" : ""}" draggable="true" data-drag-list-id="${listItem.id}" data-action="selectList" data-id="${listItem.id}" title="Drag to reorder · Double-click to edit">
        <span class="list-grip" title="Drag to reorder">${GRIP_SVG}</span>
        <span class="sq" style="background:${listItem.color}22;color:${listItem.color}">${listItem.emoji}</span>
        <span class="meta"><span>${esc(listItem.name)}</span><small>${tasksForList(listItem.id).length} tasks · ${withEst(fmtLong(listTotal(listItem.id)), listEstimateTotal(listItem.id))}</small></span>
        <button class="list-edit" title="Edit name, emoji &amp; color" data-action="editList" data-id="${listItem.id}" data-stop-propagation="true">✎</button>
      </div>`).join("");
  }

  // Per-list accent: keyed off `listItem.color`, set directly on #main so
  // the header wash, the big play button, the playing-row highlight, and
  // the toolbar's "Add task" pill hover all pick it up through CSS
  // `var(--accent, ...fallback)` rules — and so every other page (Settings,
  // Sessions, Recent) automatically stays plain green, since none of those
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
    if (state.view === "settings") { clearAccent(main); return renderSettingsPage(); }
    if (state.view === "sessions") { clearAccent(main); return renderSessionsPage(); }
    if (state.view === "recent") { clearAccent(main); return renderRecentPage(); }

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
      const onBreak = active && state.S.run.phase === "break";

      // Sessions + total time + estimate used to be three separate bits of
      // text. They're now this one capacity bar, with the numbers written
      // directly on it (fill = total time, "spent │ estimate" readout, red
      // once over) in its own column.
      const durations = taskSessions(task.id).map((session) => (session.end ?? Date.now()) - session.start);
      if (working) durations.push(Date.now() - state.S.run.runningStart);
      const bar = task.estimateMin ? buildCapacityBar(durations, task.estimateMin) : null;
      const rbarline = onBreak
        ? `<span class="rbar-status">on break</span>`
        : bar
          ? bar.html
          : `<span class="rbar-status">${fmtHM(taskTotal(task.id))}</span>`;

      return `<tr class="${active ? "playing" : ""}" draggable="true" data-drag-id="${task.id}" data-list-id="${listItem.id}" data-album="${esc(task.album || "")}" title="Drag to reorder">
        <td class="idx">
          <span class="grip" title="Drag to reorder">${GRIP_SVG}</span>
          <span class="num">${working ? "♪" : onBreak ? "☕" : index + 1}</span><button class="go" data-action="play" data-id="${task.id}" data-stop-propagation="true" title="Click to ${active ? "stop" : "start"}">${active ? "⏸" : "▶"}</button>
        </td>
        <td class="tname">${esc(task.name)}${task.depth ? `<span class="tag ${task.depth}">${task.depth}</span>` : ""}</td>
        <td class="r bar-cell">${rbarline}</td>
        <td class="menu-cell"><button class="menu-btn" title="More" data-action="openRowMenu" data-id="${task.id}" data-stop-propagation="true">⋯</button></td>
      </tr>`;
    };

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
        <table class="albrows"><tbody>${tasks.map((task, i) => taskRow(task, i)).join("")}</tbody></table>`;
    }).join("");
    // Once at least one album exists, "Singles" is always shown (even
    // empty) so there's somewhere to drop a task to take it out of its
    // album — otherwise there'd be no valid drop target for that gesture.
    const singlesSection = sections
      ? `<div class="singles-tag" data-album-drop="" title="Drop a task here to remove it from its album">Singles</div>${
          singles.length
            ? `<table class="albrows"><tbody>${singles.map((task, i) => taskRow(task, i)).join("")}</tbody></table>`
            : `<div class="empty-singles" data-album-drop="">Drop a task here to remove it from its album</div>`
        }`
      : singles.length
        ? `<table class="albrows"><tbody>${singles.map((task, i) => taskRow(task, i)).join("")}</tbody></table>`
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
  }

  function renderPlayer() {
    if (!state.S) return;
    const np = document.getElementById("np");
    const center = document.getElementById("center");
    const run = state.S.run;
    const running = run.activeTaskId && run.phase ? findTask(run.activeTaskId) : null;
    let task = running || (run.lastTaskId ? findTask(run.lastTaskId) : null);
    if (!running && task && task.completedAt) task = null;
    const listItem = task ? list(task.listId) : null;
    const badge = html`<button class="mode-btn ${state.S.config.mode !== "open" ? "on" : ""}" data-action="cycleMode" title="Session mode: ${modeLabel()} — click to change">${modeGlyph()}</button>`;

    if (!task) {
      litRender(html`<div class="art" style="background:#333">▤</div><div><div class="t" style="color:var(--muted)">Nothing playing</div><div class="l">Press ▶ on a task</div></div>`, np);
      litRender(html`<div class="controls">${badge}<button class="pmain" disabled style="opacity:.4">▶</button></div>
        <div class="timeline"><span class="clock">0:00</span><div class="bar"><span></span></div><span class="clock">—</span></div>`, center);
      return;
    }

    litRender(html`<div class="art" style="background:linear-gradient(135deg,${listItem.color},${listItem.color}55)">${listItem.emoji}</div><div><div class="t"><span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true" title="Go to ${listItem.name}">${task.name}</span></div><div class="l"><span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true">${listItem.name}</span>${running ? "" : " · paused"}</div></div>`, np);

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
      const rem = Math.max(0, state.S.config.breakMin * 60000 - (Date.now() - run.breakStart));
      const pct = 100 - rem / (state.S.config.breakMin * 60000) * 100;
      litRender(html`<div class="controls">${badge}<button class="pmain" data-action="skipBreak" title="Skip break">⏭</button><button class="stopbtn" data-action="stop">■ End</button>${lyrBtn(task.id)}</div>
        <div class="timeline"><span class="clock" id="liveclock" style="color:var(--blue)">☕ ${fmt(rem)}</span><div class="bar brk"><span id="livebar" style="width:${pct}%"></span></div><span class="clock" style="color:var(--blue)">break</span></div>`, center);
      return;
    }

    const elapsed = Date.now() - run.runningStart;
    const timerTarget = targetMs();
    const pct = timerTarget ? Math.min(100, elapsed / timerTarget * 100) : 0;
    litRender(html`<div class="controls">${badge}
        <button class="pmain" data-action="play" data-id="${task.id}" title="Stop &amp; log">⏸</button>
        <button class="pbtn" data-action="openDetail" data-id="${task.id}" title="History">☰</button>
        ${lyrBtn(task.id)}</div>
      <div class="timeline"><span class="clock" id="liveclock">${fmt(elapsed)}</span>
        <div class="bar ${pct >= 100 ? "done" : ""}"><span id="livebar" style="width:${timerTarget ? pct + "%" : "40%"};${timerTarget ? "" : "animation:pulse 1.6s ease-in-out infinite"}"></span></div>
        <span class="clock">${timerTarget ? fmt(timerTarget) : "rec"}</span></div>`, center);
  }

  function render() {
    if (!state.S) return;
    renderSidebar();
    renderMain();
    renderPlayer();
    if (state.openTaskId) renderDetail();
    document.getElementById("gear")?.classList.toggle("on", state.view === "settings");
    document.getElementById("sessBtn")?.classList.toggle("on", state.view === "sessions");
    const navBackButton = document.getElementById("navback");
    const navForwardButton = document.getElementById("navfwd");
    if (navBackButton) navBackButton.disabled = !state.navBack.length;
    if (navForwardButton) navForwardButton.disabled = !state.navFwd.length;
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

  function openSessionsPage() {
    navigate({ view: "sessions", listId: null });
  }

  function openRecentPage() {
    navigate({ view: "recent", listId: null });
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
    popmenu.innerHTML = `
      <button data-action="rowMenu" data-action-name="done" data-id="${id}">${task && task.completedAt ? "↩&nbsp; Mark as not done" : "✓&nbsp; Mark as done"}</button>
      <button data-action="rowMenu" data-action-name="history" data-id="${id}">☰&nbsp; Session history</button>
      <button data-action="rowMenu" data-action-name="rename" data-id="${id}">✎&nbsp; Rename task</button>
      <button data-action="rowMenu" data-action-name="move" data-id="${id}">↗&nbsp; Move to list…</button>
      <button data-action="rowMenu" data-action-name="toggle" data-id="${id}">${active ? "⏸&nbsp; Stop timer" : "▶&nbsp; Start timer"}</button>
      <div class="sep"></div>
      <button data-action="rowMenu" data-action-name="deep" data-id="${id}">${task && task.depth === "deep" ? "✓" : "🎯"}&nbsp; Mark deep work</button>
      <button data-action="rowMenu" data-action-name="shallow" data-id="${id}">${task && task.depth === "shallow" ? "✓" : "💤"}&nbsp; Mark shallow</button>
      <button data-action="rowMenu" data-action-name="estimate" data-id="${id}">⏳&nbsp; ${task && task.estimateMin ? "Edit estimate (" + fmtEst(task.estimateMin) + ")" : "Set estimate…"}</button>
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
    else if (action === "move") dispatch("moveTask", { id });
    else if (action === "history") openDetail(id);
    else if (action === "rename") dispatch("renameTask", { id });
    else if (action === "toggle") dispatch("play", { id });
    else if (action === "deep") dispatch("setDepth", { id, depth: "deep" });
    else if (action === "shallow") dispatch("setDepth", { id, depth: "shallow" });
    else if (action === "estimate") dispatch("setEstimate", { id });
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
    document.getElementById("modal").innerHTML = `
      <div class="top"><div class="art" style="background:linear-gradient(135deg,${listItem.color},${listItem.color}55)">${listItem.emoji}</div>
        <div><h2><span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true" title="Go to ${esc(listItem.name)}">${esc(task.name)}</span> <button class="editbtn" title="Rename" data-action="renameTask" data-id="${task.id}">✎</button></h2>
          <div class="m"><span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true">${esc(listItem.name)}</span> · ${taskSessions(task.id).length + (working ? 1 : 0)} sessions${task.depth ? " · " + task.depth : ""}</div>
          <div class="big" id="detailTotal" style="color:${listItem.color}">${fmt(taskTotal(task.id))}${task.estimateMin ? `<span class="of"> / ${fmtEst(task.estimateMin)}</span>` : ""}</div>
          <div class="estrow">${task.estimateMin ? `<div class="estbar ${estPct(task, taskTotal) >= 100 ? "done" : ""}"><span style="width:${estPct(task, taskTotal)}%"></span></div><span class="estpct">${estPct(task, taskTotal)}%</span>` : ""}<button class="linkbtn" data-action="setEstimate" data-id="${task.id}">${task.estimateMin ? "Edit estimate" : "＋ Add estimate"}</button></div>
        </div>
        <button class="close" data-action="closeDetail">×</button></div>
      <div class="body">
        <h4 class="lyr-h">♪ Lyrics <button class="linkbtn" data-action="editLyrics" data-id="${task.id}">${(task.description || "").trim() ? "Edit" : "＋ Add"}</button></h4>
        ${(task.description || "").trim()
          ? `<div class="lyrics">${esc(task.description.trim())}</div>`
          : `<div class="lyrics empty" data-action="editLyrics" data-id="${task.id}">Add lyrics — the goal, a few notes, links…</div>`}
        <div class="sh"><h4>Session history</h4><button class="pill sm" data-action="addSession" data-id="${task.id}">＋ Add session</button></div>${rows}</div>
      <div class="foot"><button class="stopbtn" data-action="play" data-id="${task.id}">${active ? "⏸ Stop" : "▶ Start timer"}</button>
        <button class="danger" data-action="deleteTask" data-id="${task.id}">Delete task</button></div>`;
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
      : `<p class="dim">No lyrics yet — add a note, the goal, or links for this task.</p>`;
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

    const status = !running ? "paused" : run.phase === "break" ? "on break" : "recording…";
    const description = (task.description || "").trim();
    let entries = taskSessions(task.id).map((session) => ({ start: session.start, end: session.end }));
    if (running && run.phase === "work" && run.runningStart) entries.push({ start: run.runningStart, end: null, live: true });
    entries.sort((a, b) => b.start - a.start);
    const now = Date.now();
    const sessions = entries.slice(0, 6).map((entry) => `<div class="ses"><span class="w">${whenLabel(entry.start)}${entry.live ? " · now" : ""}</span><span class="d">${fmt((entry.end ?? now) - entry.start)}</span></div>`).join("") || `<div class="ses"><span class="w">No sessions yet</span></div>`;

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
        ${description ? `<div class="lyrics">${esc(description)}</div>` : `<div class="lyrics empty" data-action="editLyrics" data-id="${task.id}">Add lyrics — the goal, a few notes…</div>`}
      </div>
      <div class="np-card"><h4>Recent sessions</h4>${sessions}</div>`;
  }

  function openSettings() {
    document.getElementById("soverlay").classList.add("show");
    renderSettings();
  }

  function closeSettings() {
    document.getElementById("soverlay").classList.remove("show");
  }

  function accountSectionHtml() {
    const account = state.S.account;
    if (!account) {
      return `<h4>Account</h4>
        <p class="hint" style="margin-top:0">Sign in with Google to sync your tasks and sessions across devices.</p>
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
    return `<h4>Account</h4>
      <div class="acct-row">
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

  function sessionControlsHtml() {
    const config = state.S.config;
    return `
      <div class="modes">
        <button class="modebtn ${config.mode === "open" ? "sel" : ""}" data-action="setMode" data-value="open">∞ Open<small>Track time</small></button>
        <button class="modebtn ${config.mode === "target" ? "sel" : ""}" data-action="setMode" data-value="target">🎯 Target<small>Aim for a length</small></button>
        <button class="modebtn ${config.mode === "pomodoro" ? "sel" : ""}" data-action="setMode" data-value="pomodoro">🍅 Pomodoro<small>Work / break</small></button>
      </div>
      ${config.mode === "target" ? `<h4>Target length</h4><div class="fld"><input type="number" min="1" max="240" value="${config.targetMin}" data-action="setConfigField" data-key="targetMin"> minutes</div><p class="hint">The bar fills toward your target and pulses when reached; it keeps counting if you go over.</p>` : ""}
      ${config.mode === "pomodoro" ? `<h4>Work / break lengths</h4><div class="fld"><input type="number" min="1" max="120" value="${config.workMin}" data-action="setConfigField" data-key="workMin"> min work</div><div class="fld"><input type="number" min="1" max="60" value="${config.breakMin}" data-action="setConfigField" data-key="breakMin"> min break</div><p class="hint">Work blocks auto-log; music pauses on breaks and resumes on work. Classic is 25 / 5.</p>` : ""}
      ${config.mode === "open" ? `<p class="hint">The classic stopwatch — runs until you press stop.</p>` : ""}`;
  }

  function renderSettings() {
    if (!state.S) return;
    document.getElementById("smodal").innerHTML = `
      <div class="top"><div class="art" style="background:linear-gradient(135deg,var(--green),#1db95455)">⏱️</div>
        <div><h2>Focus session</h2><div class="m">How the timer runs</div></div><button class="close" data-action="closeSettings">×</button></div>
      <div class="body"><h4>Mode</h4>${sessionControlsHtml()}</div>`;
  }

  function renderSettingsPage() {
    if (!state.S) return;
    document.getElementById("main").innerHTML = `
      <div class="hdr" data-tauri-drag-region>
        <div class="cover" style="background:linear-gradient(135deg,#5a5a5a,#2e2e2e)">⚙</div>
        <div class="info"><small>App</small><h1>Settings</h1><div class="sub">Focus session, data, and about</div></div>
      </div>
      <div class="settings-page">
        <section><h4>Focus session</h4>${sessionControlsHtml()}</section>
        <section>${accountSectionHtml()}</section>
        <section>
          <h4>Data</h4>
          <p class="hint" style="margin-top:0">Back up everything — lists, tasks, and session history — to a JSON file, or restore from one.</p>
          <div class="setrow">
            <button class="pill" data-action="exportData">⤓ Export data</button>
            <button class="pill" data-action="importData">⤒ Import data</button>
          </div>
          <p class="hint">Importing replaces all current data and can't be undone.</p>
        </section>
        <section><h4>About</h4><p class="hint" style="margin-top:0">TaskPlayer ${esc(state.S.appVersion || "")} — a Spotify-style deep-work timer. One task runs at a time; the menu-bar item shows live time.</p></section>
      </div>`;
  }

  function dayLabel(ts) {
    const date = new Date(ts);
    const now = new Date();
    const yesterday = new Date(now - 86400000);
    if (date.toDateString() === now.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  // Which "task" rows are expanded on the sessions page, keyed
  // `${dayKey}:${taskId}` so the same task on two different days toggles
  // independently. Lives only in this closure (not persisted state) since
  // it's pure UI — resets on reload, same as scroll position would.
  const expandedSessionGroups = new Set();
  function toggleSessionGroup(scopeKey, taskId) {
    const key = `${scopeKey}:${taskId}`;
    if (expandedSessionGroups.has(key)) expandedSessionGroups.delete(key);
    else expandedSessionGroups.add(key);
    renderSessionsPage();
  }

  // Day / Week / Month is a zoom level, not a different feature — pure UI
  // state, same lifetime as expandedSessionGroups above.
  let sessionsPeriod = "day";
  function setSessionsPeriod(period) {
    sessionsPeriod = period;
    renderSessionsPage();
  }

  function weekStartOf(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    const diffFromMonday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diffFromMonday);
    return d.getTime();
  }

  function renderSessionsPage() {
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
    } else if (sessionsPeriod === "week") {
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
    } else if (sessionsPeriod === "month") {
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
      <button class="${sessionsPeriod === "day" ? "active" : ""}" data-action="setSessionsPeriod" data-value="day">Day</button>
      <button class="${sessionsPeriod === "week" ? "active" : ""}" data-action="setSessionsPeriod" data-value="week">Week</button>
      <button class="${sessionsPeriod === "month" ? "active" : ""}" data-action="setSessionsPeriod" data-value="month">Month</button>
    </div>`;

    document.getElementById("main").innerHTML = `
      <div class="hdr" data-tauri-drag-region>
        <div class="cover" style="background:linear-gradient(135deg,#2e7d4f,#0c3f26)">◷</div>
        <div class="info"><small>History</small><h1>Sessions</h1><div class="sub">${items.length} session${items.length === 1 ? "" : "s"} across all tasks</div></div>
      </div>
      <div class="sessions-page">${periodTabs}${body}</div>`;
  }

  // "Recent" — a pinned sidebar entry (not a real list) that opens a
  // read-only page of the last 6 distinct tasks played, most-recent first,
  // across every list. Playing the same task again just moves it back to
  // #1 rather than adding a duplicate row.
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
      .filter((entry) => entry.task && !entry.task.completedAt)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  }

  function renderRecentPage() {
    if (!state.S) return;
    const entries = recentTasks(6);

    const rows = entries.map((entry, index) => {
      const { task, at, live } = entry;
      const listItem = list(task.listId);
      const durations = taskSessions(task.id).map((session) => (session.end ?? Date.now()) - session.start);
      if (live) durations.push(Date.now() - state.S.run.runningStart);
      const bar = task.estimateMin ? buildCapacityBar(durations, task.estimateMin) : null;
      const barCell = bar ? bar.html : `<span class="rbar-status">${fmtHM(taskTotal(task.id))}</span>`;
      const when = live ? `<span style="color:var(--green)">now · recording</span>` : timeAgo(at);

      return `<tr class="${live ? "playing" : ""}">
        <td class="idx">
          <span class="num">${index + 1}</span><button class="go" data-action="play" data-id="${task.id}" data-stop-propagation="true" title="Click to ${live ? "stop" : "start"}">${live ? "⏸" : "▶"}</button>
        </td>
        <td class="tname">
          <div>${listItem ? `<span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true" title="Go to ${esc(listItem.name)}">${esc(task.name)}</span>` : esc(task.name)}${task.depth ? `<span class="tag ${task.depth}">${task.depth}</span>` : ""}</div>
          <span class="list-tag"><i style="background:${listItem ? listItem.color : "#555"}"></i>${listItem ? `<span class="list-link" data-action="navigate" data-view="tasks" data-list-id="${listItem.id}" data-stop-propagation="true">${esc(listItem.name)}</span>` : ""}</span>
        </td>
        <td class="r bar-cell">${barCell}</td>
        <td class="rwhen">${when}</td>
      </tr>`;
    }).join("");

    document.getElementById("main").innerHTML = `
      <div class="hdr" data-tauri-drag-region>
        <div class="cover" style="background:linear-gradient(135deg,#3a3a3a,#1c1c1c);color:var(--muted)">${CLOCK_SVG}</div>
        <div class="info"><small>History</small><h1>Recent</h1><div class="sub">Last ${entries.length} task${entries.length === 1 ? "" : "s"} played, across all lists</div></div>
      </div>
      ${entries.length
        ? `<table><thead><tr><th class="idx">#</th><th>Task</th><th class="r">Progress</th><th class="rwhen">Last played</th></tr></thead>
           <tbody>${rows}</tbody></table>`
        : `<div class="empty">No tasks played yet. Press play on a task to start tracking.</div>`}`;
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
    // Switching directly from one task to another (still "work" the whole
    // time — the timer never passes through idle/break in between, see
    // timer::play's single-active-task invariant) doesn't change phase, so
    // it wouldn't otherwise be noticed here. Treat it as "new song": skip to
    // the next track instead of just letting the old one keep playing under
    // a different task.
    if (phase === "work" && state.lastPhase === "work" && taskId !== state.lastTaskId) {
      window.Music.next();
    } else if (phase !== state.lastPhase) {
      window.Music.setActive(phase === "work");
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
    openSettingsPage,
    openSessionsPage,
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
    openSettings,
    closeSettings,
    renderSettings,
    renderSettingsPage,
    renderSessionsPage,
    toggleSessionGroup,
    setSessionsPeriod,
    renderRecentPage,
    openRecentPage,
    renderMusic,
    openTrackDetail,
    closeTrackDetail,
    renderTrackDetail,
    syncMusic,
    renderSidebar,
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
