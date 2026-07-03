import { esc, fmt, fmtLong, fmtEst, fmtHM, estPct, whenLabel } from "./utils.js";
import { html, render as litRender } from "../vendor/lit-html.js";

export function createRenderer({ state, helpers, actions }) {
  const { list, activeList, findTask, tasksForList, taskSessions, taskTotal, listTotal, targetMs, modeLabel, modeGlyph } = helpers;
  const dispatch = actions || (() => undefined);

  function renderSidebar() {
    if (!state.S) return;
    document.getElementById("lists").innerHTML = state.S.lists.map((listItem) => `
      <div class="list-item ${listItem.id === state.activeListId ? "active" : ""}" data-action="selectList" data-id="${listItem.id}" title="Double-click to rename">
        <span class="sq" style="background:${listItem.color}22;color:${listItem.color}">${listItem.emoji}</span>
        <span class="meta"><span>${esc(listItem.name)}</span><small>${tasksForList(listItem.id).length} tasks · ${fmtLong(listTotal(listItem.id))}</small></span>
        <button class="list-edit" title="Rename" data-action="renameList" data-id="${listItem.id}" data-stop-propagation="true">✎</button>
      </div>`).join("");
  }

  function renderMain() {
    if (!state.S) return;
    if (state.view === "settings") return renderSettingsPage();
    if (state.view === "sessions") return renderSessionsPage();

    const listItem = activeList();
    const main = document.getElementById("main");
    if (!listItem) {
      main.innerHTML = `<div class="empty">Create a list to get started.</div>`;
      return;
    }

    const all = tasksForList(listItem.id);
    const todo = all.filter((task) => !task.completedAt);
    const done = all.filter((task) => task.completedAt).sort((a, b) => b.completedAt - a.completedAt);

    const rows = todo.map((task, index) => {
      const active = state.S.run.activeTaskId === task.id && state.S.run.phase;
      const working = active && state.S.run.phase === "work" && state.S.run.runningStart;
      const onBreak = active && state.S.run.phase === "break";
      const sessionCount = taskSessions(task.id).length;
      return `<tr class="${active ? "playing" : ""}" data-action="play" data-id="${task.id}" title="Click to ${active ? "stop" : "start"}">
        <td class="idx" data-action="play" data-id="${task.id}" data-stop-propagation="true"><span class="num">${working ? "♪" : onBreak ? "☕" : index + 1}</span><button class="go">${active ? "⏸" : "▶"}</button></td>
        <td class="tname">${esc(task.name)}${task.depth ? `<span class="tag ${task.depth}">${task.depth}</span>` : ""}</td>
        <td class="total">${onBreak ? "on break" : sessionCount + " session" + (sessionCount === 1 ? "" : "s")}</td>
        <td class="r total">${fmtHM(taskTotal(task.id))}${task.estimateMin ? `<span class="est"> / ${fmtEst(task.estimateMin)}</span>` : ""}</td>
        <td class="menu-cell"><button class="menu-btn" title="More" data-action="openRowMenu" data-id="${task.id}" data-stop-propagation="true">⋯</button></td>
      </tr>`;
    }).join("");

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
      <div class="hdr">
        <div class="cover" style="background:linear-gradient(135deg,${listItem.color},${listItem.color}55)">${listItem.emoji}</div>
        <div class="info"><small>Task List</small><h1>${esc(listItem.name)}</h1><div class="sub">${todo.length} to do${done.length ? " · " + done.length + " done" : ""} · ${fmtLong(listTotal(listItem.id))} tracked</div></div>
      </div>
      <div class="toolbar">
        <button class="play-all" data-action="playFirst" title="Play first task">▶</button>
        <button class="pill" data-action="addTask">＋ Add task</button>
      </div>
      ${todo.length ? `<table><thead><tr><th class="idx">#</th><th>Task</th><th>Sessions</th><th class="r">Total time</th><th class="menu-cell"></th></tr></thead><tbody>${rows}</tbody></table>`
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

    litRender(html`<div class="art" style="background:linear-gradient(135deg,${listItem.color},${listItem.color}55)">${listItem.emoji}</div><div><div class="t">${task.name}</div><div class="l">${listItem.name}${running ? "" : " · paused"}</div></div>`, np);

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

  function toggleCompleted() {
    state.completedOpen = !state.completedOpen;
    renderMain();
  }

  function playFirst() {
    const task = tasksForList(activeList().id).find((item) => !item.completedAt);
    if (task) dispatch("play", { id: task.id });
  }

  function openRowMenu(event, id) {
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
      <div class="sep"></div>
      <button class="danger" data-action="rowMenu" data-action-name="delete" data-id="${id}">🗑&nbsp; Delete task</button>`;
    popmenu.classList.add("show");
    const rect = event.currentTarget.getBoundingClientRect();
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
    const rows = entries.length ? entries.map((entry) => `<div class="entry ${entry.live ? "live" : ""}"><span class="when">${whenLabel(entry.start)}${entry.live ? " · recording…" : ""}</span><span class="dur">${fmt((entry.end ?? now) - entry.start)}</span>${entry.live ? `<span class="entry-del"></span>` : `<button class="entry-del" title="Remove session" data-action="deleteSession" data-id="${entry.id}">×</button>`}</div>`).join("")
      : `<div class="entry"><span class="when">No sessions logged yet</span><span class="dur">—</span></div>`;
    document.getElementById("modal").innerHTML = `
      <div class="top"><div class="art" style="background:linear-gradient(135deg,${listItem.color},${listItem.color}55)">${listItem.emoji}</div>
        <div><h2>${esc(task.name)} <button class="editbtn" title="Rename" data-action="renameTask" data-id="${task.id}">✎</button></h2>
          <div class="m">${esc(listItem.name)} · ${taskSessions(task.id).length + (working ? 1 : 0)} sessions${task.depth ? " · " + task.depth : ""}</div>
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
    const description = (task.description || "").trim();
    const body = description
      ? description.split(/\n{2,}/).map((paragraph) => `<p>${esc(paragraph).replace(/\n/g, "<br>")}</p>`).join("")
      : `<p class="dim">No lyrics yet — add a note, the goal, or links for this task.</p>`;
    document.getElementById("lyrmodal").innerHTML = `
      <div class="lyr-hd">
        <span class="lyr-lab">♪ Lyrics · ${esc(task.name)}</span>
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
        <h2>${esc(task.name)}</h2>
        <div class="m">${esc(listItem.name)} · ${status}${task.estimateMin ? " · est " + fmtEst(task.estimateMin) : ""}</div>
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
      <div class="hdr">
        <div class="cover" style="background:linear-gradient(135deg,#5a5a5a,#2e2e2e)">⚙</div>
        <div class="info"><small>App</small><h1>Settings</h1><div class="sub">Focus session, data, and about</div></div>
      </div>
      <div class="settings-page">
        <section><h4>Focus session</h4>${sessionControlsHtml()}</section>
        <section>
          <h4>Data</h4>
          <p class="hint" style="margin-top:0">Back up everything — lists, tasks, and session history — to a JSON file, or restore from one.</p>
          <div class="setrow">
            <button class="pill" data-action="exportData">⤓ Export data</button>
            <button class="pill" data-action="importData">⤒ Import data</button>
          </div>
          <p class="hint">Importing replaces all current data and can't be undone.</p>
        </section>
        <section><h4>About</h4><p class="hint" style="margin-top:0">TaskPlayer 0.1.0 — a Spotify-style deep-work timer. One task runs at a time; the menu-bar item shows live minutes.</p></section>
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

  function renderSessionsPage() {
    if (!state.S) return;
    const now = Date.now();
    const items = state.S.sessions.map((session) => ({ id: session.id, taskId: session.taskId, start: session.start, end: session.end }));
    const run = state.S.run;
    if (run.activeTaskId && run.phase === "work" && run.runningStart) {
      items.push({ id: null, taskId: run.activeTaskId, start: run.runningStart, end: null, live: true });
    }
    items.sort((a, b) => b.start - a.start);

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

    const body = items.length ? groups.map((group) => {
      const total = group.items.reduce((sum, item) => sum + ((item.end ?? now) - item.start), 0);
      const rows = group.items.map((item) => {
        const task = findTask(item.taskId);
        const listItem = task ? list(task.listId) : null;
        const time = new Date(item.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        const deleteButton = (item.live || !item.id) ? `<span class="entry-del"></span>`
          : `<button class="entry-del" title="Remove session" data-action="deleteSession" data-id="${item.id}">×</button>`;
        return `<div class="sess ${item.live ? "live" : ""}">
          <span class="sess-dot" style="background:${listItem ? listItem.color : "#555"}"></span>
          <span class="sess-name">${task ? esc(task.name) : "(deleted task)"}${item.live ? " · recording…" : ""}</span>
          <span class="sess-list">${listItem ? esc(listItem.name) : ""}</span>
          <span class="sess-time">${time}</span>
          <span class="sess-dur">${fmt((item.end ?? now) - item.start)}</span>${deleteButton}</div>`;
      }).join("");
      return `<section class="sess-group">
        <div class="sess-head"><h4>${dayLabel(group.ts)}</h4><span class="sess-total">${fmtLong(total)}</span></div>
        ${rows}</section>`;
    }).join("") : `<div class="empty">No sessions yet. Press play on a task to start tracking.</div>`;

    document.getElementById("main").innerHTML = `
      <div class="hdr">
        <div class="cover" style="background:linear-gradient(135deg,#2e7d4f,#0c3f26)">◷</div>
        <div class="info"><small>History</small><h1>Sessions</h1><div class="sub">${items.length} session${items.length === 1 ? "" : "s"} across all tasks</div></div>
      </div>
      <div class="sessions-page">${body}</div>`;
  }

  function renderMusic(m) {
    if (!window.Music?.GENRES) return;
    const genre = window.Music.GENRES[m.genre] || { label: "🎧 Music" };
    const options = Object.entries(window.Music.GENRES).map(([key, value]) => `<option value="${key}" ${key === m.genre ? "selected" : ""}>${value.label}</option>`).join("");
    const emoji = (genre.label.match(/^\S+/) || ["🎧"])[0];
    const genreName = genre.label.replace(/^\S+\s*/, "");
    const stateName = m.loading ? "loading" : m.playing ? "playing" : "idle";
    const name = m.loading ? "Finding tracks…" : (m.playing || (m.name && m.name !== "Focus music")) ? esc(m.name) : "Not playing";
    document.getElementById("music").innerHTML = `<div class="music ${stateName}">
      <div class="m-art" title="Focus music">
        <span class="m-note">♪</span>
        <span class="m-eq"><i></i><i></i><i></i><i></i></span>
      </div>
      <div class="m-meta">
        <span class="m-label">Focus music</span>
        <span class="m-name">${name}</span>
      </div>
      <label class="m-genre" title="Change vibe">
        <select data-action="musicSetGenre">${options}</select>
        <span class="m-genre-face"><span class="g-emo">${emoji}</span><span class="g-name">${esc(genreName)}</span></span>
      </label>
      <button class="m-next" title="Next track" data-action="musicNext">⟳</button>
      <div class="m-vol">
        <span class="m-vol-ic">${m.volume > 0 ? "🔊" : "🔈"}</span>
        <input class="vol" type="range" min="0" max="1" step="0.05" value="${m.volume}" oninput="window.Music.setVolume(this.value)">
      </div>
    </div>`;
  }

  function syncMusic() {
    if (!state.S) return;
    const phase = state.S.run.phase ?? null;
    if (phase === state.lastPhase) return;
    window.Music.setActive(phase === "work");
    state.lastPhase = phase;
  }

  return {
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
    renderMusic,
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
  };
}
