// Main window — renders from the Rust core via Tauri commands + events.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let S = null;                 // latest Snapshot from Rust
let activeListId = null;
let view = "tasks";               // "tasks" | "settings" | "sessions" (derived from `route`)
let completedOpen = false;        // Completed group collapsed by default
let railOpen = (localStorage.getItem("tp.rail") ?? "1") === "1"; // Now Playing rail (on by default)
// --- navigation history (Finder/Spotify-style back/forward) ---
// A route is the current page. Modals/dialogs are overlays, NOT routes.
let route = { view: "tasks", listId: null };
const navBack = [], navFwd = [];
let openTaskId = null;
let lyricsId = null;          // task whose lyrics panel is open (null = closed)
let lastPhase = null;         // for music auto pause/resume across pomodoro transitions

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function fmt(ms) { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; const p = (n) => String(n).padStart(2, "0"); return h ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`; }
function fmtLong(ms) { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); if (h) return `${h}h ${m}m`; if (m) return `${m}m`; return `${s}s`; }
function whenLabel(ts) { const d = new Date(ts), now = new Date(); const y = new Date(now - 86400000); const day = d.toDateString() === now.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); return `${day} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`; }

const list = (id) => S.lists.find((l) => l.id === id);
const activeList = () => list(activeListId) || S.lists[0];
const findTask = (id) => S.tasks.find((t) => t.id === id);
const tasksForList = (lid) => S.tasks.filter((t) => t.listId === lid);
const taskSessions = (id) => S.sessions.filter((s) => s.taskId === id);
function taskTotal(id) {
  const now = Date.now();
  let ms = taskSessions(id).reduce((a, s) => a + ((s.end ?? now) - s.start), 0);
  const r = S.run;
  if (r.activeTaskId === id && r.phase === "work" && r.runningStart) ms += now - r.runningStart;
  return ms;
}
const listTotal = (lid) => tasksForList(lid).reduce((a, t) => a + taskTotal(t.id), 0);
const targetMs = () => { const c = S.config; return c.mode === "target" ? c.targetMin * 60000 : c.mode === "pomodoro" ? c.workMin * 60000 : null; };
const modeLabel = () => { const c = S.config; return c.mode === "target" ? `🎯 ${c.targetMin}m target` : c.mode === "pomodoro" ? `🍅 ${c.workMin}/${c.breakMin}` : "∞ Open"; };
// compact shuffle-style mode toggle: one monochrome glyph, tinted when timed
const modeGlyph = () => { const m = S.config.mode; return m === "target" ? "◎" : m === "pomodoro" ? "◔" : "∞"; };
function cycleMode() { const order = ["open", "target", "pomodoro"]; setMode(order[(order.indexOf(S.config.mode) + 1) % order.length]); }
const fmtEst = (min) => parseFloat((min / 60).toFixed(2)) + "h";           // 90 -> "1.5h"
const fmtHM = (ms) => { const m = Math.floor(ms / 60000), h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${m}m`; }; // no seconds
const estPct = (t) => t.estimateMin ? Math.min(100, Math.round(taskTotal(t.id) / (t.estimateMin * 60000) * 100)) : 0;

// ---------- in-app dialogs (macOS WKWebView doesn't support window.prompt) ----------
// Generic modal form. `collect()` returns the resolved value; returning
// `undefined` means "invalid — keep the dialog open" (e.g. bad session input).
function uiForm({ title, bodyHtml = "", confirmText = "OK", danger = false, focusSel = null, collect }) {
  return new Promise((resolve) => {
    const ov = document.getElementById("doverlay");
    const dm = document.getElementById("dmodal");
    dm.innerHTML = `
      <div class="dtitle">${esc(title)}</div>
      ${bodyHtml}
      <div class="dfoot">
        <button class="btn" id="dcancel">Cancel</button>
        <button class="btn ${danger ? "danger" : "primary"}" id="dok">${esc(confirmText)}</button>
      </div>`;
    ov.classList.add("show");
    const f = focusSel && dm.querySelector(focusSel);
    if (f) { f.focus(); if (f.select) f.select(); }

    function finish(result) {
      ov.classList.remove("show");
      ov.onclick = null;
      document.removeEventListener("keydown", onKey);
      resolve(result);
    }
    function ok() { const v = collect(); if (v !== undefined) finish(v); }
    const cancel = () => finish(null);
    function onKey(e) {
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); ok(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    }
    document.getElementById("dok").onclick = ok;
    document.getElementById("dcancel").onclick = cancel;
    ov.onclick = (e) => { if (e.target === ov) cancel(); };
    document.addEventListener("keydown", onKey);
  });
}
const uiPrompt = (title, value = "") => uiForm({
  title, confirmText: "OK", focusSel: "#dinput",
  bodyHtml: `<input class="dinput" id="dinput" value="${esc(value)}" autocomplete="off" autocorrect="off" spellcheck="false" />`,
  collect: () => document.getElementById("dinput").value.trim() || null,
});
const uiConfirm = (title, message, confirmText = "Delete") => uiForm({
  title, confirmText, danger: true,
  bodyHtml: message ? `<div class="dbody">${esc(message)}</div>` : "",
  collect: () => true,
});
const uiNote = (title, message, confirmText = "Done") => uiForm({
  title, confirmText,
  bodyHtml: `<div class="dbody">${message}</div>`,
  collect: () => true,
});

// ---------- commands ----------
async function apply(snap) { S = snap; if (!activeListId || !list(activeListId)) activeListId = S.lists[0]?.id ?? null; syncMusic(); render(); }
async function addList() { const name = await uiPrompt("New list name"); if (name) apply(await invoke("add_list", { name })); }
async function renameList(id) { const l = list(id); const name = await uiPrompt("Rename list", l ? l.name : ""); if (name) apply(await invoke("rename_list", { id, name })); }
async function deleteList(id) { if (await uiConfirm("Delete list?", "This deletes the list and all of its tasks.")) apply(await invoke("delete_list", { id })); }
function selectList(id) { navigate({ view: "tasks", listId: id }); }
async function addTask() { if (!activeListId) return; const name = await uiPrompt("Task name"); if (name) apply(await invoke("add_task", { listId: activeListId, name })); }
async function renameTask(id) { const t = findTask(id); const name = await uiPrompt("Rename task", t ? t.name : ""); if (name) apply(await invoke("rename_task", { id, name })); }
async function setDepth(id, depth) { const t = findTask(id); const next = t && t.depth === depth ? null : depth; apply(await invoke("set_depth", { id, depth: next })); }
async function deleteTask(id) { if (await uiConfirm("Delete task?", "This deletes the task and its session history.")) { apply(await invoke("delete_task", { id })); if (openTaskId === id) closeDetail(); } }
async function setEstimate(id) {
  const t = findTask(id);
  const cur = t && t.estimateMin ? String(parseFloat((t.estimateMin / 60).toFixed(2))) : "";
  const v = await uiForm({
    title: "Time estimate", confirmText: "Save", focusSel: "#estIn",
    bodyHtml: `<div class="dbody">About how long will this task take? Leave blank to clear.</div>
      <div class="ffield"><label>Estimate</label><input type="number" id="estIn" min="0" max="1000" step="0.25" value="${cur}" autocomplete="off"> hours</div>`,
    collect: () => {
      const raw = document.getElementById("estIn").value.trim();
      if (raw === "") return { minutes: null };
      const h = parseFloat(raw);
      if (isNaN(h) || h < 0) return undefined;
      return { minutes: Math.round(h * 60) };
    },
  });
  if (v) apply(await invoke("set_estimate", { id, minutes: v.minutes }));
}
async function toggleDone(id) { apply(await invoke("set_done", { id })); }
async function moveTask(id) {
  const t = findTask(id); if (!t) return;
  const others = S.lists.filter((l) => l.id !== t.listId);
  if (!others.length) { await uiNote("Move task", "Create another list first, then you can move tasks into it."); return; }
  const opts = others.map((l) => `<option value="${l.id}">${l.emoji} ${esc(l.name)}</option>`).join("");
  const v = await uiForm({
    title: "Move to list", confirmText: "Move", focusSel: "#mvSel",
    bodyHtml: `<div class="dbody">Move “${esc(t.name)}” to another list.</div>
      <div class="ffield"><label>List</label><select id="mvSel">${opts}</select></div>`,
    collect: () => ({ listId: document.getElementById("mvSel").value }),
  });
  if (v && v.listId) apply(await invoke("move_task", { id, listId: v.listId }));
}
async function editLyrics(id) {
  const t = findTask(id); if (!t) return;
  const cur = t.description || "";
  const v = await uiForm({
    title: "Lyrics", confirmText: "Save", focusSel: "#lyrIn",
    bodyHtml: `<div class="dbody">A note, the goal, links — what this task is about.</div>
      <textarea class="dtextarea" id="lyrIn" rows="6" placeholder="Write the lyrics…">${esc(cur)}</textarea>`,
    collect: () => ({ text: document.getElementById("lyrIn").value.trim() || null }),
  });
  if (!v) return;
  const snap = await invoke("set_description", { id, text: v.text });
  apply(snap);
  if (lyricsId === id) renderLyrics();
}
async function addSession(taskId) {
  const now = new Date(), p = (n) => String(n).padStart(2, "0");
  const dateVal = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const timeVal = `${p(now.getHours())}:${p(now.getMinutes())}`;
  const body = `
    <div class="dbody">Log time you already spent on this task.</div>
    <div class="ffield"><label>Date</label><input type="date" id="sfDate" value="${dateVal}" max="${dateVal}"></div>
    <div class="ffield"><label>Start</label><input type="time" id="sfTime" value="${timeVal}"></div>
    <div class="ffield"><label>Duration</label><input type="number" id="sfMin" min="1" max="1440" value="25"> minutes</div>`;
  const v = await uiForm({
    title: "Add session", confirmText: "Add", focusSel: "#sfMin", bodyHtml: body,
    collect: () => {
      const d = document.getElementById("sfDate").value;
      const t = document.getElementById("sfTime").value || "00:00";
      const min = parseInt(document.getElementById("sfMin").value, 10);
      const start = new Date(`${d}T${t}`).getTime();
      if (!d || !min || min <= 0 || isNaN(start)) return undefined; // invalid → keep open
      return { start, end: start + min * 60000 };
    },
  });
  if (v) apply(await invoke("add_session", { taskId, start: v.start, end: v.end }));
}
async function deleteSession(id) { apply(await invoke("delete_session", { id })); }
async function exportData() {
  try {
    const path = await invoke("export_data");
    await uiNote("Data exported", `Saved a backup and revealed it in Finder:<br><span style="color:#fff;word-break:break-all">${esc(path)}</span>`);
  } catch (e) {
    await uiNote("Export failed", esc(String(e)), "OK");
  }
}
function importData() {
  const inp = document.getElementById("importFile");
  inp.value = "";
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    let text;
    try { text = await f.text(); } catch { return; }
    const ok = await uiConfirm("Import data?", "This replaces all your current lists, tasks, and history with the contents of this file. It can't be undone.", "Replace");
    if (!ok) return;
    try {
      const snap = await invoke("import_data", { payload: text });
      closeDetail();
      apply(snap);
      await uiNote("Import complete", `Loaded ${snap.lists.length} list${snap.lists.length === 1 ? "" : "s"} and ${snap.tasks.length} task${snap.tasks.length === 1 ? "" : "s"}.`);
    } catch (e) {
      await uiNote("Import failed", esc(String(e)), "OK");
    }
  };
  inp.click();
}
// Play/pause a task. Music is bound to this: apply() -> syncMusic() starts
// music when the task enters work and stops it otherwise. One control, both.
async function play(id) { apply(await invoke("play", { taskId: id })); }
async function stop() { apply(await invoke("stop")); }
async function skipBreak() { apply(await invoke("skip_break")); }
async function setMode(mode) { apply(await invoke("set_mode", { mode })); renderSettings(); }
async function setConfigField(key, value) { apply(await invoke("set_config_field", { key, value: parseInt(value, 10) || 1 })); renderSettings(); }

// ---------- render ----------
function render() {
  renderSidebar();
  renderMain();
  renderPlayer();
  if (openTaskId) renderDetail();
  document.getElementById("gear")?.classList.toggle("on", view === "settings");
  document.getElementById("sessBtn")?.classList.toggle("on", view === "sessions");
  const nb = document.getElementById("navback"), nf = document.getElementById("navfwd");
  if (nb) nb.disabled = !navBack.length;
  if (nf) nf.disabled = !navFwd.length;
  document.getElementById("app")?.classList.toggle("rail", railOpen);
  document.getElementById("railtoggle")?.classList.toggle("on", railOpen);
  renderNowPlaying();
}
function toggleRail() { railOpen = !railOpen; localStorage.setItem("tp.rail", railOpen ? "1" : "0"); render(); }

// --- router: single chokepoint for all page changes ---
const sameRoute = (a, b) => a.view === b.view && (a.listId || null) === (b.listId || null);
function applyRoute() {
  view = route.view;
  if (route.view === "tasks" && route.listId && list(route.listId)) activeListId = route.listId;
  render();
  animatePage();
}
// gentle fade + rise on the content when navigating (respects Reduce Motion)
function animatePage() {
  const m = document.getElementById("main");
  if (!m || !m.animate) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  m.animate(
    [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
    { duration: 260, easing: "cubic-bezier(.22,.61,.36,1)" }
  );
}
function navigate(next) {
  if (sameRoute(next, route)) { applyRoute(); return; }
  navBack.push(route); navFwd.length = 0; route = next; applyRoute();
}
function goBack() { if (!navBack.length) return; navFwd.push(route); route = navBack.pop(); applyRoute(); }
function goForward() { if (!navFwd.length) return; navBack.push(route); route = navFwd.pop(); applyRoute(); }
function openSettingsPage() { navigate({ view: "settings", listId: null }); }
function openSessionsPage() { navigate({ view: "sessions", listId: null }); }

function renderSidebar() {
  document.getElementById("lists").innerHTML = S.lists.map((l) => `
    <div class="list-item ${l.id === activeListId ? "active" : ""}" onclick="selectList('${l.id}')" ondblclick="renameList('${l.id}')" title="Double-click to rename">
      <span class="sq" style="background:${l.color}22;color:${l.color}">${l.emoji}</span>
      <span class="meta"><span>${esc(l.name)}</span><small>${tasksForList(l.id).length} tasks · ${fmtLong(listTotal(l.id))}</small></span>
      <button class="list-edit" title="Rename" onclick="event.stopPropagation();renameList('${l.id}')">✎</button>
    </div>`).join("");
}

function renderMain() {
  if (view === "settings") return renderSettingsPage();
  if (view === "sessions") return renderSessionsPage();
  const l = activeList();
  const main = document.getElementById("main");
  if (!l) { main.innerHTML = `<div class="empty">Create a list to get started.</div>`; return; }
  const all = tasksForList(l.id);
  const todo = all.filter((t) => !t.completedAt);
  const done = all.filter((t) => t.completedAt).sort((a, b) => b.completedAt - a.completedAt);

  const rows = todo.map((t, i) => {
    const active = S.run.activeTaskId === t.id && S.run.phase;
    const working = active && S.run.phase === "work" && S.run.runningStart;
    const onBreak = active && S.run.phase === "break";
    const n = taskSessions(t.id).length;
    return `<tr class="${active ? "playing" : ""}" onclick="play('${t.id}')" title="Click to ${active ? "stop" : "start"}">
      <td class="idx" onclick="event.stopPropagation();play('${t.id}')"><span class="num">${working ? "♪" : onBreak ? "☕" : i + 1}</span><button class="go">${active ? "⏸" : "▶"}</button></td>
      <td class="tname">${esc(t.name)}${t.depth ? `<span class="tag ${t.depth}">${t.depth}</span>` : ""}</td>
      <td class="total">${onBreak ? "on break" : n + " session" + (n === 1 ? "" : "s")}</td>
      <td class="r total">${fmtHM(taskTotal(t.id))}${t.estimateMin ? `<span class="est"> / ${fmtEst(t.estimateMin)}</span>` : ""}</td>
      <td class="menu-cell"><button class="menu-btn" title="More" onclick="event.stopPropagation();openRowMenu(event,'${t.id}')">⋯</button></td>
    </tr>`;
  }).join("");

  const doneRows = done.map((t) => `
    <div class="crow" onclick="openDetail('${t.id}')">
      <button class="ccheck" title="Mark as not done" onclick="event.stopPropagation();toggleDone('${t.id}')">✓</button>
      <span class="cname">${esc(t.name)}</span>
      <span class="ctime">${fmtHM(taskTotal(t.id))}</span>
      <button class="menu-btn" title="More" onclick="event.stopPropagation();openRowMenu(event,'${t.id}')">⋯</button>
    </div>`).join("");
  const completedGroup = done.length ? `
    <div class="cgroup ${completedOpen ? "open" : ""}">
      <div class="chead" onclick="toggleCompleted()"><span class="chev">›</span> Completed · ${done.length}</div>
      <div class="clist">${doneRows}</div>
    </div>` : "";

  main.innerHTML = `
    <div class="hdr">
      <div class="cover" style="background:linear-gradient(135deg,${l.color},${l.color}55)">${l.emoji}</div>
      <div class="info"><small>Task List</small><h1>${esc(l.name)}</h1><div class="sub">${todo.length} to do${done.length ? " · " + done.length + " done" : ""} · ${fmtLong(listTotal(l.id))} tracked</div></div>
    </div>
    <div class="toolbar">
      <button class="play-all" onclick="playFirst()" title="Play first task">▶</button>
      <button class="pill" onclick="addTask()">＋ Add task</button>
    </div>
    ${todo.length ? `<table><thead><tr><th class="idx">#</th><th>Task</th><th>Sessions</th><th class="r">Total time</th><th class="menu-cell"></th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="empty">${all.length ? "All done here. 🎉" : "No tasks yet. Click <b>Add task</b> to start."}</div>`}
    ${completedGroup}
    <p class="note">Only one task runs at a time. The menu-bar item shows live minutes and toggles play/pause.</p>`;
}
function toggleCompleted() { completedOpen = !completedOpen; renderMain(); }
function playFirst() { const t = tasksForList(activeList().id).find((x) => !x.completedAt); if (t) play(t.id); }

function renderPlayer() {
  const np = document.getElementById("np"), center = document.getElementById("center");
  const r = S.run;
  const running = r.activeTaskId && r.phase ? findTask(r.activeTaskId) : null;
  // Spotify-style: when stopped, keep showing the last task — unless it's been
  // completed (a finished task shouldn't linger in the now-playing bar).
  let t = running || (r.lastTaskId ? findTask(r.lastTaskId) : null);
  if (!running && t && t.completedAt) t = null;
  const l = t ? list(t.listId) : null;
  const badge = `<button class="mode-btn ${S.config.mode !== "open" ? "on" : ""}" onclick="cycleMode()" title="Session mode: ${modeLabel()} — click to change">${modeGlyph()}</button>`;

  if (!t) {
    np.innerHTML = `<div class="art" style="background:#333">▤</div><div><div class="t" style="color:var(--muted)">Nothing playing</div><div class="l">Press ▶ on a task</div></div>`;
    center.innerHTML = `<div class="controls">${badge}<button class="pmain" disabled style="opacity:.4">▶</button></div>
      <div class="timeline"><span class="clock">0:00</span><div class="bar"><span></span></div><span class="clock">—</span></div>`;
    return;
  }
  np.innerHTML = `<div class="art" style="background:linear-gradient(135deg,${l.color},${l.color}55)">${l.emoji}</div><div><div class="t">${esc(t.name)}</div><div class="l">${esc(l.name)}${running ? "" : " · paused"}</div></div>`;

  if (!running) {
    // remembered but stopped — resume from where you left off
    const tm = targetMs();
    center.innerHTML = `<div class="controls">${badge}
        <button class="pmain" onclick="play('${t.id}')" title="Resume timer">▶</button>
        <button class="pbtn" onclick="openDetail('${t.id}')" title="History">☰</button>
        ${lyrBtn(t.id)}</div>
      <div class="timeline"><span class="clock">${fmt(taskTotal(t.id))}</span>
        <div class="bar"><span style="width:0"></span></div>
        <span class="clock">${tm ? fmt(tm) : "total"}</span></div>`;
    return;
  }

  if (r.phase === "break") {
    const rem = Math.max(0, S.config.breakMin * 60000 - (Date.now() - r.breakStart));
    const pct = 100 - rem / (S.config.breakMin * 60000) * 100;
    center.innerHTML = `<div class="controls">${badge}<button class="pmain" onclick="skipBreak()" title="Skip break">⏭</button><button class="stopbtn" onclick="stop()">■ End</button>${lyrBtn(t.id)}</div>
      <div class="timeline"><span class="clock" id="liveclock" style="color:var(--blue)">☕ ${fmt(rem)}</span><div class="bar brk"><span id="livebar" style="width:${pct}%"></span></div><span class="clock" style="color:var(--blue)">break</span></div>`;
    return;
  }
  const elapsed = Date.now() - r.runningStart, tm = targetMs();
  const pct = tm ? Math.min(100, elapsed / tm * 100) : 0;
  center.innerHTML = `<div class="controls">${badge}
      <button class="pmain" onclick="play('${t.id}')" title="Stop &amp; log">⏸</button>
      <button class="pbtn" onclick="openDetail('${t.id}')" title="History">☰</button>
      ${lyrBtn(t.id)}</div>
    <div class="timeline"><span class="clock" id="liveclock">${fmt(elapsed)}</span>
      <div class="bar ${pct >= 100 ? "done" : ""}"><span id="livebar" style="width:${tm ? pct + "%" : "40%"};${tm ? "" : "animation:pulse 1.6s ease-in-out infinite"}"></span></div>
      <span class="clock">${tm ? fmt(tm) : "rec"}</span></div>`;
}

// ---------- row kebab menu ----------
function openRowMenu(e, id) {
  const pm = document.getElementById("popmenu");
  const t = findTask(id);
  const active = S.run.activeTaskId === id && S.run.phase;
  pm.innerHTML = `
    <button onclick="rowMenu('done','${id}')">${t && t.completedAt ? "↩&nbsp; Mark as not done" : "✓&nbsp; Mark as done"}</button>
    <button onclick="rowMenu('history','${id}')">☰&nbsp; Session history</button>
    <button onclick="rowMenu('rename','${id}')">✎&nbsp; Rename task</button>
    <button onclick="rowMenu('move','${id}')">↗&nbsp; Move to list…</button>
    <button onclick="rowMenu('toggle','${id}')">${active ? "⏸&nbsp; Stop timer" : "▶&nbsp; Start timer"}</button>
    <div class="sep"></div>
    <button onclick="rowMenu('deep','${id}')">${t && t.depth === "deep" ? "✓" : "🎯"}&nbsp; Mark deep work</button>
    <button onclick="rowMenu('shallow','${id}')">${t && t.depth === "shallow" ? "✓" : "💤"}&nbsp; Mark shallow</button>
    <button onclick="rowMenu('estimate','${id}')">⏳&nbsp; ${t && t.estimateMin ? "Edit estimate (" + fmtEst(t.estimateMin) + ")" : "Set estimate…"}</button>
    <div class="sep"></div>
    <button class="danger" onclick="rowMenu('delete','${id}')">🗑&nbsp; Delete task</button>`;
  pm.classList.add("show");
  const rc = e.currentTarget.getBoundingClientRect(), w = pm.offsetWidth || 190;
  pm.style.left = Math.max(8, rc.right - w) + "px";
  pm.style.top = (rc.bottom + 6) + "px";
}
function closeRowMenu() { document.getElementById("popmenu").classList.remove("show"); }
function rowMenu(a, id) { closeRowMenu();
  if (a === "done") toggleDone(id);
  else if (a === "move") moveTask(id);
  else if (a === "history") openDetail(id);
  else if (a === "rename") renameTask(id);
  else if (a === "toggle") play(id);
  else if (a === "deep") setDepth(id, "deep");
  else if (a === "shallow") setDepth(id, "shallow");
  else if (a === "estimate") setEstimate(id);
  else if (a === "delete") deleteTask(id);
}
document.addEventListener("click", (e) => { const pm = document.getElementById("popmenu"); if (pm.classList.contains("show") && !pm.contains(e.target) && !e.target.closest(".menu-btn")) closeRowMenu(); });
window.addEventListener("resize", closeRowMenu);

// ---------- detail modal ----------
function openDetail(id) { openTaskId = id; document.getElementById("overlay").classList.add("show"); renderDetail(); }
function closeDetail() { openTaskId = null; document.getElementById("overlay").classList.remove("show"); }
function renderDetail() {
  const t = findTask(openTaskId); if (!t) { closeDetail(); return; }
  const l = list(t.listId);
  const active = S.run.activeTaskId === t.id && S.run.phase;
  const working = active && S.run.phase === "work" && S.run.runningStart;
  let entries = taskSessions(t.id).map((e) => ({ id: e.id, start: e.start, end: e.end }));
  if (working) entries.push({ start: S.run.runningStart, end: null, live: true });
  entries.sort((a, b) => b.start - a.start);
  const now = Date.now();
  const rows = entries.length ? entries.map((e) => `<div class="entry ${e.live ? "live" : ""}"><span class="when">${whenLabel(e.start)}${e.live ? " · recording…" : ""}</span><span class="dur">${fmt((e.end ?? now) - e.start)}</span>${e.live ? `<span class="entry-del"></span>` : `<button class="entry-del" title="Remove session" onclick="deleteSession('${e.id}')">×</button>`}</div>`).join("")
    : `<div class="entry"><span class="when">No sessions logged yet</span><span class="dur">—</span></div>`;
  document.getElementById("modal").innerHTML = `
    <div class="top"><div class="art" style="background:linear-gradient(135deg,${l.color},${l.color}55)">${l.emoji}</div>
      <div><h2>${esc(t.name)} <button class="editbtn" title="Rename" onclick="renameTask('${t.id}')">✎</button></h2>
        <div class="m">${esc(l.name)} · ${taskSessions(t.id).length + (working ? 1 : 0)} sessions${t.depth ? " · " + t.depth : ""}</div>
        <div class="big" id="detailTotal" style="color:${l.color}">${fmt(taskTotal(t.id))}${t.estimateMin ? `<span class="of"> / ${fmtEst(t.estimateMin)}</span>` : ""}</div>
        <div class="estrow">${t.estimateMin ? `<div class="estbar ${estPct(t) >= 100 ? "done" : ""}"><span style="width:${estPct(t)}%"></span></div><span class="estpct">${estPct(t)}%</span>` : ""}<button class="linkbtn" onclick="setEstimate('${t.id}')">${t.estimateMin ? "Edit estimate" : "＋ Add estimate"}</button></div>
      </div>
      <button class="close" onclick="closeDetail()">×</button></div>
    <div class="body">
      <h4 class="lyr-h">♪ Lyrics <button class="linkbtn" onclick="editLyrics('${t.id}')">${(t.description || "").trim() ? "Edit" : "＋ Add"}</button></h4>
      ${(t.description || "").trim()
        ? `<div class="lyrics">${esc(t.description.trim())}</div>`
        : `<div class="lyrics empty" onclick="editLyrics('${t.id}')">Add lyrics — the goal, a few notes, links…</div>`}
      <div class="sh"><h4>Session history</h4><button class="pill sm" onclick="addSession('${t.id}')">＋ Add session</button></div>${rows}</div>
    <div class="foot"><button class="stopbtn" onclick="play('${t.id}')">${active ? "⏸ Stop" : "▶ Start timer"}</button>
      <button class="danger" onclick="deleteTask('${t.id}')">Delete task</button></div>`;
}

// ---------- in-session lyrics panel (Spotify-style, opened from the player) ----------
const LYRIC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h11M5 12h9M5 17h13"/><circle cx="19.6" cy="16" r="2.1" fill="currentColor" stroke="none"/><path d="M21.7 15.7V9.4"/></svg>`;
const lyrBtn = (id) => `<button class="pbtn lyrbtn" title="Lyrics" onclick="openLyrics('${id}')">${LYRIC_ICON}</button>`;
function openLyrics(id) { lyricsId = id; document.getElementById("lyroverlay").classList.add("show"); renderLyrics(); }
function closeLyrics() { document.getElementById("lyroverlay").classList.remove("show"); lyricsId = null; }
function renderLyrics() {
  const t = findTask(lyricsId); if (!t) { closeLyrics(); return; }
  const d = (t.description || "").trim();
  const body = d
    ? d.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")
    : `<p class="dim">No lyrics yet — add a note, the goal, or links for this task.</p>`;
  document.getElementById("lyrmodal").innerHTML = `
    <div class="lyr-hd">
      <span class="lyr-lab">♪ Lyrics · ${esc(t.name)}</span>
      <button class="lyr-ed" onclick="editLyrics('${t.id}')">${d ? "Edit" : "＋ Add"}</button>
      <button class="lyr-x" onclick="closeLyrics()">×</button>
    </div>
    <div class="lyr-body">${body}</div>`;
}

// ---------- Now Playing rail (3rd column, pinned to the current task) ----------
function renderNowPlaying() {
  const el = document.getElementById("nprail");
  if (!el || !railOpen) return;
  const r = S.run;
  const running = r.activeTaskId && r.phase ? findTask(r.activeTaskId) : null;
  let t = running || (r.lastTaskId ? findTask(r.lastTaskId) : null);
  if (!running && t && t.completedAt) t = null;
  const l = t ? list(t.listId) : null;
  if (!t || !l) {
    el.innerHTML = `<div class="lab">Now playing</div>
      <div class="np-empty"><div class="np-art idle">▤</div><p>Nothing playing.<br>Press ▶ on a task to start.</p></div>`;
    return;
  }
  const status = !running ? "paused" : r.phase === "break" ? "on break" : "recording…";
  const d = (t.description || "").trim();

  let entries = taskSessions(t.id).map((s) => ({ start: s.start, end: s.end }));
  if (running && r.phase === "work" && r.runningStart) entries.push({ start: r.runningStart, end: null, live: true });
  entries.sort((a, b) => b.start - a.start);
  const now = Date.now();
  const sess = entries.slice(0, 6).map((e) =>
    `<div class="ses"><span class="w">${whenLabel(e.start)}${e.live ? " · now" : ""}</span><span class="d">${fmt((e.end ?? now) - e.start)}</span></div>`
  ).join("") || `<div class="ses"><span class="w">No sessions yet</span></div>`;

  el.innerHTML = `
    <div class="lab">Now playing</div>
    <div class="np-card np-info">
      <div class="np-art" style="background:linear-gradient(135deg,${l.color},${l.color}88)">${l.emoji}</div>
      <h2>${esc(t.name)}</h2>
      <div class="m">${esc(l.name)} · ${status}${t.estimateMin ? " · est " + fmtEst(t.estimateMin) : ""}</div>
      ${running ? `<div class="acts"><button class="donebtn" onclick="toggleDone('${t.id}')">✓ Mark as done</button></div>` : ""}
    </div>
    <div class="np-card">
      <h4>♪ Lyrics <button class="linkbtn" onclick="editLyrics('${t.id}')">${d ? "Edit" : "＋ Add"}</button></h4>
      ${d ? `<div class="lyrics">${esc(d)}</div>` : `<div class="lyrics empty" onclick="editLyrics('${t.id}')">Add lyrics — the goal, a few notes…</div>`}
    </div>
    <div class="np-card"><h4>Recent sessions</h4>${sess}</div>`;
}

// ---------- session settings modal ----------
function openSettings() { document.getElementById("soverlay").classList.add("show"); renderSettings(); }
function closeSettings() { document.getElementById("soverlay").classList.remove("show"); }
function sessionControlsHtml() {
  const c = S.config;
  return `
    <div class="modes">
      <button class="modebtn ${c.mode === "open" ? "sel" : ""}" onclick="setMode('open')">∞ Open<small>Track time</small></button>
      <button class="modebtn ${c.mode === "target" ? "sel" : ""}" onclick="setMode('target')">🎯 Target<small>Aim for a length</small></button>
      <button class="modebtn ${c.mode === "pomodoro" ? "sel" : ""}" onclick="setMode('pomodoro')">🍅 Pomodoro<small>Work / break</small></button>
    </div>
    ${c.mode === "target" ? `<h4>Target length</h4><div class="fld"><input type="number" min="1" max="240" value="${c.targetMin}" onchange="setConfigField('targetMin',this.value)"> minutes</div><p class="hint">The bar fills toward your target and pulses when reached; it keeps counting if you go over.</p>` : ""}
    ${c.mode === "pomodoro" ? `<h4>Work / break lengths</h4><div class="fld"><input type="number" min="1" max="120" value="${c.workMin}" onchange="setConfigField('workMin',this.value)"> min work</div><div class="fld"><input type="number" min="1" max="60" value="${c.breakMin}" onchange="setConfigField('breakMin',this.value)"> min break</div><p class="hint">Work blocks auto-log; music pauses on breaks and resumes on work. Classic is 25 / 5.</p>` : ""}
    ${c.mode === "open" ? `<p class="hint">The classic stopwatch — runs until you press stop.</p>` : ""}`;
}
function renderSettings() {
  document.getElementById("smodal").innerHTML = `
    <div class="top"><div class="art" style="background:linear-gradient(135deg,var(--green),#1db95455)">⏱️</div>
      <div><h2>Focus session</h2><div class="m">How the timer runs</div></div><button class="close" onclick="closeSettings()">×</button></div>
    <div class="body"><h4>Mode</h4>${sessionControlsHtml()}</div>`;
}
function renderSettingsPage() {
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
          <button class="pill" onclick="exportData()">⤓ Export data</button>
          <button class="pill" onclick="importData()">⤒ Import data</button>
        </div>
        <p class="hint">Importing replaces all current data and can't be undone.</p>
      </section>
      <section><h4>About</h4><p class="hint" style="margin-top:0">TaskPlayer 0.1.0 — a Spotify-style deep-work timer. One task runs at a time; the menu-bar item shows live minutes.</p></section>
    </div>`;
}
function dayLabel(ts) {
  const d = new Date(ts), now = new Date(), y = new Date(now - 86400000);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function renderSessionsPage() {
  const now = Date.now();
  // every logged session across all tasks, plus the live work segment if running
  const items = S.sessions.map((s) => ({ id: s.id, taskId: s.taskId, start: s.start, end: s.end }));
  const r = S.run;
  if (r.activeTaskId && r.phase === "work" && r.runningStart) {
    items.push({ id: null, taskId: r.activeTaskId, start: r.runningStart, end: null, live: true });
  }
  items.sort((a, b) => b.start - a.start);

  // group consecutive (already sorted) sessions by local calendar day
  const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const groups = [];
  let cur = null;
  for (const it of items) {
    const k = dayKey(it.start);
    if (!cur || cur.key !== k) { cur = { key: k, ts: it.start, items: [] }; groups.push(cur); }
    cur.items.push(it);
  }

  const body = items.length ? groups.map((g) => {
    const total = g.items.reduce((a, it) => a + ((it.end ?? now) - it.start), 0);
    const rows = g.items.map((it) => {
      const t = findTask(it.taskId), l = t ? list(t.listId) : null;
      const time = new Date(it.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const del = (it.live || !it.id) ? `<span class="entry-del"></span>`
        : `<button class="entry-del" title="Remove session" onclick="deleteSession('${it.id}')">×</button>`;
      return `<div class="sess ${it.live ? "live" : ""}">
        <span class="sess-dot" style="background:${l ? l.color : "#555"}"></span>
        <span class="sess-name">${t ? esc(t.name) : "(deleted task)"}${it.live ? " · recording…" : ""}</span>
        <span class="sess-list">${l ? esc(l.name) : ""}</span>
        <span class="sess-time">${time}</span>
        <span class="sess-dur">${fmt((it.end ?? now) - it.start)}</span>${del}</div>`;
    }).join("");
    return `<section class="sess-group">
      <div class="sess-head"><h4>${dayLabel(g.ts)}</h4><span class="sess-total">${fmtLong(total)}</span></div>
      ${rows}</section>`;
  }).join("") : `<div class="empty">No sessions yet. Press play on a task to start tracking.</div>`;

  document.getElementById("main").innerHTML = `
    <div class="hdr">
      <div class="cover" style="background:linear-gradient(135deg,#2e7d4f,#0c3f26)">◷</div>
      <div class="info"><small>History</small><h1>Sessions</h1><div class="sub">${items.length} session${items.length === 1 ? "" : "s"} across all tasks</div></div>
    </div>
    <div class="sessions-page">${body}</div>`;
}

// ---------- music widget ----------
function renderMusic(m) {
  const g = window.Music.GENRES[m.genre] || { label: "🎧 Music" };
  const opts = Object.entries(window.Music.GENRES).map(([k, v]) => `<option value="${k}" ${k === m.genre ? "selected" : ""}>${v.label}</option>`).join("");
  const emoji = (g.label.match(/^\S+/) || ["🎧"])[0];
  const gname = g.label.replace(/^\S+\s*/, "");
  const state = m.loading ? "loading" : m.playing ? "playing" : "idle";
  const name = m.loading ? "Finding tracks…"
    : (m.playing || (m.name && m.name !== "Focus music")) ? esc(m.name)
    : "Not playing";
  document.getElementById("music").innerHTML = `<div class="music ${state}">
    <div class="m-art" title="Focus music">
      <span class="m-note">♪</span>
      <span class="m-eq"><i></i><i></i><i></i><i></i></span>
    </div>
    <div class="m-meta">
      <span class="m-label">Focus music</span>
      <span class="m-name">${name}</span>
    </div>
    <label class="m-genre" title="Change vibe">
      <select onchange="window.Music.setGenre(this.value)">${opts}</select>
      <span class="m-genre-face"><span class="g-emo">${emoji}</span><span class="g-name">${esc(gname)}</span></span>
    </label>
    <button class="m-next" title="Next track" onclick="window.Music.next()">⟳</button>
    <div class="m-vol">
      <span class="m-vol-ic">${m.volume > 0 ? "🔊" : "🔈"}</span>
      <input class="vol" type="range" min="0" max="1" step="0.05" value="${m.volume}" oninput="window.Music.setVolume(this.value)">
    </div>
  </div>`;
}

// Music is bound to the task: it plays only while a task is in its work phase,
// and stops on break, stop, or menu-bar pause — no independent music control.
function syncMusic() {
  if (!S) return;
  const phase = S.run.phase ?? null;
  if (phase === lastPhase) return;
  window.Music.setActive(phase === "work");
  lastPhase = phase;
}

// ---------- live tick ----------
setInterval(() => {
  if (!S) return;
  const r = S.run;
  syncMusic();
  if (r.activeTaskId && r.phase) {
    const clock = document.getElementById("liveclock");
    if (r.phase === "work" && r.runningStart) {
      const el = Date.now() - r.runningStart;
      if (clock) clock.textContent = fmt(el);
      const bar = document.getElementById("livebar"), tm = targetMs();
      if (bar && tm) { const pct = Math.min(100, el / tm * 100); bar.style.width = pct + "%"; bar.parentElement.classList.toggle("done", pct >= 100); }
      const dt = document.getElementById("detailTotal");
      if (dt && openTaskId === r.activeTaskId) dt.textContent = fmt(taskTotal(r.activeTaskId));
    } else if (r.phase === "break" && r.breakStart) {
      const rem = Math.max(0, S.config.breakMin * 60000 - (Date.now() - r.breakStart));
      if (clock) clock.textContent = "☕ " + fmt(rem);
      const bar = document.getElementById("livebar");
      if (bar) bar.style.width = (100 - rem / (S.config.breakMin * 60000) * 100) + "%";
    }
  }
}, 1000);
// refresh totals in the table periodically while running
setInterval(() => { if (S && S.run.activeTaskId && S.run.phase === "work") { renderSidebar(); renderMain(); renderNowPlaying(); } }, 5000);

// back / forward keyboard shortcuts (⌘[ / ⌘]) — matches Safari & Finder.
// Ignored while a modal/dialog is open so it doesn't navigate behind overlays.
document.addEventListener("keydown", (e) => {
  // Esc closes the lyrics panel (unless a dialog is on top of it)
  if (e.key === "Escape" && lyricsId && !document.getElementById("doverlay").classList.contains("show")) {
    closeLyrics();
    return;
  }
  if (!e.metaKey || e.key !== "[" && e.key !== "]") return;
  if (document.querySelector(".overlay.show")) return;
  e.preventDefault();
  e.key === "[" ? goBack() : goForward();
});

// ---------- boot ----------
(async function init() {
  window.Music.setOnChange(renderMusic);
  S = await invoke("get_snapshot");
  activeListId = S.lists[0]?.id ?? null;
  route = { view: "tasks", listId: activeListId };
  lastPhase = S.run.phase ?? null;
  render();
  await listen("state-changed", (e) => { S = e.payload; if (!list(activeListId)) activeListId = S.lists[0]?.id ?? null; syncMusic(); render(); });
})();
