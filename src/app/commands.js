import { esc } from "./utils.js";

// Curated set for the "Edit list" emoji picker — common categories a task
// list tends to fall into (work, home, fitness, creative, ...), rather than
// a full system emoji keyboard, which would need its own search/scroll UI
// far beyond what a small dialog can hold.
const LIST_EMOJIS = [
  "📁", "🎯", "📚", "💼", "🏠", "🎨", "🎵", "🏋️",
  "🛒", "✈️", "💰", "🧠", "🍳", "🌱", "🐾", "❤️",
  "🎮", "📷", "🧹", "🔧", "📝", "💻", "🎓", "🧘",
  "⚽", "🎬", "🌟", "🔥", "✅", "📌", "🗂️", "🛠️",
];

export function createCommands({ state, ui, renderer, invoke }) {
  const { uiPrompt, uiConfirm, uiNote } = ui;

  async function apply(snap) {
    state.S = snap;
    if (!state.activeListId || !list(state.activeListId)) {
      state.activeListId = state.S.lists[0]?.id ?? null;
    }
    renderer.syncMusic();
    renderer.render();
  }

  const list = (id) => state.S?.lists.find((item) => item.id === id);
  const findTask = (id) => state.S?.tasks.find((task) => task.id === id);

  async function addList() {
    const name = await uiPrompt("New list name");
    if (name) apply(await invoke("add_list", { name }));
  }

  async function editList(id) {
    const current = list(id);
    if (!current) return;
    // Falls back to the first picker option if the list's current emoji
    // isn't one of the curated choices (e.g. an older custom one), so the
    // grid always shows something selected rather than nothing highlighted.
    let chosenEmoji = LIST_EMOJIS.includes(current.emoji) ? current.emoji : LIST_EMOJIS[0];
    const emojiGridHtml = LIST_EMOJIS.map(
      (e) => `<button type="button" class="emoji-opt${e === chosenEmoji ? " sel" : ""}" data-emoji="${e}">${e}</button>`
    ).join("");
    const previewStyle = (color) => `background:${color}22;color:${color};width:32px;height:32px;border-radius:5px;display:grid;place-items:center;font-size:15px;flex:none`;
    // `uiForm` mutates the DOM synchronously before it returns its (still
    // pending) promise — see ui.js — so it's safe to grab these elements and
    // wire them up here, right after the call, rather than needing ui.js to
    // expose some kind of "onMount" hook just for this one dialog.
    const formPromise = uiForm({
      title: "Edit list",
      confirmText: "Save",
      focusSel: "#listNameIn",
      bodyHtml: `
        <div class="ffield"><label>Preview</label><span id="stylePreview" style="${previewStyle(current.color)}">${chosenEmoji}</span></div>
        <div class="ffield"><label>Name</label><input type="text" id="listNameIn" value="${esc(current.name)}" autocomplete="off" autocorrect="off" spellcheck="false" style="flex:1"></div>
        <div class="ffield" style="align-items:flex-start"><label>Emoji</label><div class="emoji-grid" id="emojiGrid">${emojiGridHtml}</div></div>
        <div class="ffield"><label>Color</label><input type="color" id="listColorIn" value="${esc(current.color)}"></div>`,
      collect: () => {
        const name = document.getElementById("listNameIn").value.trim();
        if (!name) return undefined;
        const color = document.getElementById("listColorIn").value;
        return { name, emoji: chosenEmoji, color };
      },
    });
    // The grid's own highlighted tile and the color swatch both show the
    // current pick, but neither made it obvious *something changed* when
    // clicked — this preview is the one place both come together, updated
    // live so picking either one has an immediate, unambiguous result.
    const preview = document.getElementById("stylePreview");
    const colorInput = document.getElementById("listColorIn");
    const grid = document.getElementById("emojiGrid");
    grid?.addEventListener("click", (event) => {
      const btn = event.target.closest(".emoji-opt");
      if (!btn) return;
      chosenEmoji = btn.dataset.emoji;
      grid.querySelectorAll(".emoji-opt.sel").forEach((el) => el.classList.remove("sel"));
      btn.classList.add("sel");
      if (preview) preview.textContent = chosenEmoji;
    });
    colorInput?.addEventListener("input", () => {
      if (preview) preview.style.cssText = previewStyle(colorInput.value);
    });
    const value = await formPromise;
    if (!value) return;
    // Name lives on a separate command from emoji/color (matches the
    // backend's existing rename_list vs. the new set_list_style) — both
    // fire from this one dialog, so just apply the final snapshot.
    await invoke("rename_list", { id, name: value.name });
    apply(await invoke("set_list_style", { id, emoji: value.emoji, color: value.color }));
  }

  async function deleteList(id) {
    if (await uiConfirm("Delete list?", "This deletes the list and all of its tasks.")) {
      apply(await invoke("delete_list", { id }));
    }
  }

  function selectList(id) {
    renderer.navigate({ view: "tasks", listId: id });
  }

  async function addTask() {
    if (!state.activeListId) return;
    const value = await uiForm({
      title: "New task",
      confirmText: "Add task",
      focusSel: "#taskNameIn",
      bodyHtml: `
        <div class="ffield"><label>Name</label><input id="taskNameIn" placeholder="Task name" autocomplete="off" autocorrect="off" spellcheck="false" style="flex:1"></div>
        <div class="ffield"><label>Estimate</label><input type="number" id="taskEstIn" min="0.25" max="1000" step="0.25" value="0.5" autocomplete="off"> hours</div>`,
      collect: () => {
        const name = document.getElementById("taskNameIn").value.trim();
        if (!name) return undefined;
        const hours = parseFloat(document.getElementById("taskEstIn").value);
        if (isNaN(hours) || hours <= 0) return undefined;
        return { name, minutes: Math.round(hours * 60) };
      },
    });
    if (value) apply(await invoke("add_task", { listId: state.activeListId, name: value.name, estimateMin: value.minutes }));
  }

  async function renameTask(id) {
    const task = findTask(id);
    const name = await uiPrompt("Rename task", task ? task.name : "");
    if (name) apply(await invoke("rename_task", { id, name }));
  }

  async function setDepth(id, depth) {
    const task = findTask(id);
    const next = task && task.depth === depth ? null : depth;
    apply(await invoke("set_depth", { id, depth: next }));
  }

  async function deleteTask(id) {
    if (await uiConfirm("Delete task?", "This deletes the task and its session history.")) {
      apply(await invoke("delete_task", { id }));
      if (state.openTaskId === id) renderer.closeDetail();
    }
  }

  async function setEstimate(id) {
    if (!state.S) return;
    const task = findTask(id);
    const currentValue = task && task.estimateMin ? String(parseFloat((task.estimateMin / 60).toFixed(2))) : "";
    const value = await uiForm({
      title: "Time estimate",
      confirmText: "Save",
      focusSel: "#estIn",
      bodyHtml: `<div class="dbody">About how long will this task take? Leave blank to clear.</div>
        <div class="ffield"><label>Estimate</label><input type="number" id="estIn" min="0" max="1000" step="0.25" value="${currentValue}" autocomplete="off"> hours</div>`,
      collect: () => {
        const raw = document.getElementById("estIn").value.trim();
        if (raw === "") return { minutes: null };
        const hours = parseFloat(raw);
        if (isNaN(hours) || hours < 0) return undefined;
        return { minutes: Math.round(hours * 60) };
      },
    });
    if (value) apply(await invoke("set_estimate", { id, minutes: value.minutes }));
  }

  async function toggleDone(id) {
    apply(await invoke("set_done", { id }));
  }

  async function moveTask(id) {
    if (!state.S) return;
    const task = findTask(id);
    if (!task) return;
    const others = state.S.lists.filter((listItem) => listItem.id !== task.listId);
    if (!others.length) {
      await uiNote("Move task", "Create another list first, then you can move tasks into it.");
      return;
    }
    const options = others.map((listItem) => `<option value="${listItem.id}">${listItem.emoji} ${esc(listItem.name)}</option>`).join("");
    const value = await uiForm({
      title: "Move to list",
      confirmText: "Move",
      focusSel: "#mvSel",
      bodyHtml: `<div class="dbody">Move “${esc(task.name)}” to another list.</div>
        <div class="ffield"><label>List</label><select id="mvSel">${options}</select></div>`,
      collect: () => ({ listId: document.getElementById("mvSel").value }),
    });
    if (value && value.listId) apply(await invoke("move_task", { id, listId: value.listId }));
  }

  async function reorderTasks(listId, orderedIds) {
    apply(await invoke("reorder_tasks", { listId, orderedIds }));
  }

  async function setAlbum(id) {
    if (!state.S) return;
    const task = findTask(id);
    if (!task) return;
    const others = new Set(state.S.tasks.filter((item) => item.listId === task.listId && item.album).map((item) => item.album));
    const optionsHtml = Array.from(others).map((name) => `<option value="${esc(name)}"></option>`).join("");
    const value = await uiForm({
      title: "Set album",
      confirmText: "Save",
      focusSel: "#albIn",
      bodyHtml: `<div class="dbody">Group this with related tasks under an album — type an existing one or a new name. Leave blank for no album.</div>
        <div class="ffield"><label>Album</label><input id="albIn" list="albumOptions" placeholder="e.g. Backend" autocomplete="off" value="${esc(task.album || "")}"><datalist id="albumOptions">${optionsHtml}</datalist></div>`,
      collect: () => ({ album: document.getElementById("albIn").value.trim() || null }),
    });
    if (value) apply(await invoke("set_album", { id, album: value.album }));
  }

  async function moveTaskToAlbum(id, album) {
    apply(await invoke("set_album", { id, album: album || null }));
  }

  async function reorderLists(orderedIds) {
    apply(await invoke("reorder_lists", { orderedIds }));
  }

  async function editLyrics(id) {
    const task = findTask(id);
    if (!task) return;
    const current = task.description || "";
    const value = await uiForm({
      title: "Lyrics",
      confirmText: "Save",
      focusSel: "#lyrIn",
      bodyHtml: `<div class="dbody">A note, the goal, links — what this task is about.</div>
        <textarea class="dtextarea" id="lyrIn" rows="6" placeholder="Write the lyrics…">${esc(current)}</textarea>`,
      collect: () => ({ text: document.getElementById("lyrIn").value.trim() || null }),
    });
    if (!value) return;
    const snap = await invoke("set_description", { id, text: value.text });
    apply(snap);
    if (state.lyricsId === id) renderer.renderLyrics();
  }

  async function addSession(taskId) {
    if (!state.S) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateValue = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeValue = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const body = `
      <div class="dbody">Log time you already spent on this task.</div>
      <div class="ffield"><label>Date</label><input type="date" id="sfDate" value="${dateValue}" max="${dateValue}"></div>
      <div class="ffield"><label>Start</label><input type="time" id="sfTime" value="${timeValue}"></div>
      <div class="ffield"><label>Duration</label><input type="number" id="sfMin" min="1" max="1440" value="25"> minutes</div>`;
    const value = await uiForm({
      title: "Add session",
      confirmText: "Add",
      focusSel: "#sfMin",
      bodyHtml: body,
      collect: () => {
        const date = document.getElementById("sfDate").value;
        const time = document.getElementById("sfTime").value || "00:00";
        const minutes = parseInt(document.getElementById("sfMin").value, 10);
        const start = new Date(`${date}T${time}`).getTime();
        if (!date || !minutes || minutes <= 0 || isNaN(start)) return undefined;
        return { start, end: start + minutes * 60000 };
      },
    });
    if (value) apply(await invoke("add_session", { taskId, start: value.start, end: value.end }));
  }

  async function editSession(id) {
    if (!state.S) return;
    const session = state.S.sessions.find((item) => item.id === id);
    if (!session) return;
    const start = new Date(session.start);
    const pad = (n) => String(n).padStart(2, "0");
    const dateValue = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    const timeValue = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const currentMin = Math.max(1, Math.round(((session.end ?? Date.now()) - session.start) / 60000));
    const body = `
      <div class="dbody">Adjust when this session started and how long it ran.</div>
      <div class="ffield"><label>Date</label><input type="date" id="sfDate" value="${dateValue}"></div>
      <div class="ffield"><label>Start</label><input type="time" id="sfTime" value="${timeValue}"></div>
      <div class="ffield"><label>Duration</label><input type="number" id="sfMin" min="1" max="1440" value="${currentMin}"> minutes</div>`;
    const value = await uiForm({
      title: "Edit session",
      confirmText: "Save",
      focusSel: "#sfMin",
      bodyHtml: body,
      collect: () => {
        const date = document.getElementById("sfDate").value;
        const time = document.getElementById("sfTime").value || "00:00";
        const minutes = parseInt(document.getElementById("sfMin").value, 10);
        const newStart = new Date(`${date}T${time}`).getTime();
        if (!date || !minutes || minutes <= 0 || isNaN(newStart)) return undefined;
        return { start: newStart, end: newStart + minutes * 60000 };
      },
    });
    if (value) apply(await invoke("update_session", { id, start: value.start, end: value.end }));
  }

  async function deleteSession(id) {
    apply(await invoke("delete_session", { id }));
  }

  // Opens a track's Audius page in the system browser — a plain <a href>
  // would just navigate this app's own webview away instead.
  async function openTrackLink(url) {
    if (!url) return;
    try {
      await invoke("open_url", { url });
    } catch (error) {
      await uiNote("Couldn't open link", esc(String(error)), "OK");
    }
  }

  async function exportData() {
    try {
      const path = await invoke("export_data");
      await uiNote("Data exported", `Saved a backup and revealed it in Finder:<br><span style="color:#fff;word-break:break-all">${esc(path)}</span>`);
    } catch (error) {
      await uiNote("Export failed", esc(String(error)), "OK");
    }
  }

  async function signInGoogle() {
    try {
      await invoke("sign_in_google");
      // No apply() here — sign_in_google only opens the browser and returns;
      // the real state update arrives later via the "state-changed" event
      // once the deep-link callback completes the token exchange.
    } catch (error) {
      await uiNote("Sign-in failed", esc(String(error)), "OK");
    }
  }

  async function signOut() {
    apply(await invoke("sign_out"));
  }

  async function syncNow() {
    // Fire-and-forget, like signInGoogle — the Rust side notifies via
    // "state-changed" once the sync (syncing -> done) completes.
    await invoke("sync_now");
  }

  async function fullSync() {
    // Same fire-and-forget shape as syncNow, but resets the incremental
    // cursors first so this sync re-checks everything instead of trusting
    // "updated_at > cursor" — the fix for a row from another device that
    // never showed up here.
    await invoke("full_sync");
  }

  function importData() {
    if (!state.S) return;
    const input = document.getElementById("importFile");
    input.value = "";
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      let text;
      try {
        text = await file.text();
      } catch {
        return;
      }
      const ok = await uiConfirm("Import data?", "This replaces all your current lists, tasks, and history with the contents of this file. It can't be undone.", "Replace");
      if (!ok) return;
      try {
        const snap = await invoke("import_data", { payload: text });
        renderer.closeDetail();
        apply(snap);
        await uiNote("Import complete", `Loaded ${snap.lists.length} list${snap.lists.length === 1 ? "" : "s"} and ${snap.tasks.length} task${snap.tasks.length === 1 ? "" : "s"}.`);
      } catch (error) {
        await uiNote("Import failed", esc(String(error)), "OK");
      }
    };
    input.click();
  }

  async function play(id) {
    apply(await invoke("play", { taskId: id }));
  }

  async function stop() {
    apply(await invoke("stop"));
  }

  async function skipBreak() {
    apply(await invoke("skip_break"));
  }

  async function setMode(mode) {
    apply(await invoke("set_mode", { mode }));
    renderer.renderSettings();
  }

  async function setConfigField(key, value) {
    apply(await invoke("set_config_field", { key, value: parseInt(value, 10) || 1 }));
    renderer.renderSettings();
  }

  function uiForm({ title, bodyHtml = "", confirmText = "OK", danger = false, focusSel = null, collect }) {
    return ui.uiForm({ title, bodyHtml, confirmText, danger, focusSel, collect });
  }

  return {
    addList,
    editList,
    reorderLists,
    deleteList,
    selectList,
    addTask,
    renameTask,
    setDepth,
    deleteTask,
    setEstimate,
    toggleDone,
    moveTask,
    reorderTasks,
    setAlbum,
    moveTaskToAlbum,
    editLyrics,
    addSession,
    editSession,
    deleteSession,
    openTrackLink,
    exportData,
    importData,
    play,
    stop,
    skipBreak,
    setMode,
    setConfigField,
    signInGoogle,
    signOut,
    syncNow,
    fullSync,
    apply,
    uiForm,
  };
}
