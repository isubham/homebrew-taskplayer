import { esc } from "./utils.js";

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

  async function renameList(id) {
    const current = list(id);
    const name = await uiPrompt("Rename list", current ? current.name : "");
    if (name) apply(await invoke("rename_list", { id, name }));
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
    const name = await uiPrompt("Task name");
    if (name) apply(await invoke("add_task", { listId: state.activeListId, name }));
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

  async function deleteSession(id) {
    apply(await invoke("delete_session", { id }));
  }

  async function exportData() {
    try {
      const path = await invoke("export_data");
      await uiNote("Data exported", `Saved a backup and revealed it in Finder:<br><span style="color:#fff;word-break:break-all">${esc(path)}</span>`);
    } catch (error) {
      await uiNote("Export failed", esc(String(error)), "OK");
    }
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
    renameList,
    deleteList,
    selectList,
    addTask,
    renameTask,
    setDepth,
    deleteTask,
    setEstimate,
    toggleDone,
    moveTask,
    editLyrics,
    addSession,
    deleteSession,
    exportData,
    importData,
    play,
    stop,
    skipBreak,
    setMode,
    setConfigField,
    apply,
    uiForm,
  };
}
