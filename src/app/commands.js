import { esc, LIFE_AREAS, colorForArea } from "./utils.js";
import { timeToMinute, simpleScheduleRowHtml, simpleScheduleEditorHtml, updateOvernightIndicator } from "./weekly-schedule.js";

// Curated set for the "Edit list" emoji picker, grouped into the categories
// a task list tends to fall into — still a curated pick per category (24
// each, 2 even rows in the 12-column grid — see the "dlg-emoji" width
// override in styles.css, sized specifically to fit this), not a full
// system emoji keyboard, which would need its own search/scroll UI far
// beyond what this dialog holds. A prev/next pager (see editList's
// goToCategory) steps between categories one at a time, naming the one
// you've landed on — a per-category icon-tab row read less clearly than
// just spelling out the category name, especially for categories whose
// "representative" icon isn't obviously that category at a glance.
const EMOJI_CATEGORIES = [
  { key: "work", label: "Work & Productivity", emojis: ["📁", "💼", "🎯", "📊", "📈", "🗂️", "📝", "✅", "⏰", "📅", "💻", "🖥️", "📌", "📎", "🖇️", "📇", "🖨️", "⌨️", "🖱️", "📠", "📋", "🗓️", "🗒️", "📮"] },
  { key: "home", label: "Home & Chores", emojis: ["🏠", "🛋️", "🛏️", "🚪", "🪴", "🧹", "🧺", "🧽", "🧴", "🔑", "🪑", "🚿", "🛁", "🧻", "🗑️", "🪟", "🕯️", "🧯", "🧼", "🛌", "🚰", "🧱", "🪞", "🪒"] },
  { key: "health", label: "Health & Fitness", emojis: ["🏋️", "🧘", "🏃", "🚴", "⚽", "🏀", "🎾", "🥗", "🍎", "💧", "😴", "🩺", "💊", "🧠", "👟", "🦵", "🏊", "🤸", "🥊", "🍏", "🫀", "🦶", "🧬", "🩹"] },
  { key: "money", label: "Money & Shopping", emojis: ["💰", "💳", "🏦", "🧾", "🛍️", "🪙", "💵", "📉", "🧮", "🛒", "🏷️", "💸", "📦", "🧧", "🪪", "💹", "💶", "💷", "🏧", "💲", "🎟️", "🛎️", "🗞️", "🏬"] },
  { key: "creative", label: "Creative & Hobbies", emojis: ["🎨", "🎵", "🎸", "🎬", "📷", "🎮", "🧵", "✂️", "🖌️", "📚", "✍️", "🎭", "🎹", "📸", "🖼️", "🎤", "🎻", "🥁", "🎺", "🧶", "🪡", "🎲", "🧸", "🪄"] },
  { key: "learning", label: "Learning & Growth", emojis: ["🎓", "📖", "🧠", "💡", "🔬", "🧪", "🧑‍🎓", "✏️", "🗣️", "🧩", "📐", "🔭", "🌐", "📔", "🧑‍🏫", "🏫", "📏", "📓", "📰", "🔎", "🧫", "🗄️", "🖋️", "🧑‍🔬"] },
  { key: "nature", label: "Nature & Animals", emojis: ["🌱", "🌳", "🌻", "🐾", "🐶", "🐱", "🦋", "🌊", "⛰️", "☀️", "🌙", "🔥", "🐦", "🐟", "🍀", "🌈", "🐢", "🦉", "🐝", "🌵", "🍂", "❄️", "⭐", "🌾"] },
  { key: "travel", label: "Travel & Places", emojis: ["✈️", "🚗", "🚆", "🏖️", "🗺️", "🎒", "🏕️", "🌍", "🚢", "🏨", "🚕", "🛳️", "🚲", "🛺", "⛺", "🧳", "🛫", "🛬", "🚉", "🗽", "🗼", "🏰", "🚀", "🛵"] },
  { key: "social", label: "Social & Celebrations", emojis: ["❤️", "👪", "👫", "💬", "🎉", "🎁", "🤝", "🎂", "🥳", "💌", "📞", "👋", "🫂", "💞", "🎊", "🗨️", "💍", "🥂", "🍾", "🎈", "🕺", "💃", "🧑‍🤝‍🧑", "🗯️"] },
];

// Which category (if any) a given emoji belongs to — used to open the
// picker on the right page for the list's current emoji, rather than
// always defaulting to the first category.
const findEmojiCategory = (emoji) => EMOJI_CATEGORIES.find((c) => c.emojis.includes(emoji));

// Shared <select> options for the life-area picker (New list / Edit list),
// with "Not tagged" as the neutral first choice so a list defaults to not
// affecting the radar chart at all.
const lifeAreaOptionsHtml = (selected) =>
  `<option value="">Not tagged</option>` +
  LIFE_AREAS.map((a) => `<option value="${a.key}" ${a.key === selected ? "selected" : ""}>${esc(a.label)}</option>`).join("");

const lifeDirOptionsHtml = (selected) => `
  <option value="increase" ${selected !== "decrease" ? "selected" : ""}>Increases this area</option>
  <option value="decrease" ${selected === "decrease" ? "selected" : ""}>Decreases this area</option>`;

function bindWeeklyEditor(id) {
  const editor = document.getElementById(id);
  if (!editor) return;
  const list = editor.querySelector("[data-window-list]");
  const updateRemoveButtons = () => {
    const onlyOne = list.querySelectorAll("[data-window-row]").length === 1;
    list.querySelectorAll("[data-window-remove]").forEach((button) => button.classList.toggle("hidden", onlyOne));
  };
  editor.querySelector("[data-window-add]")?.addEventListener("click", () => {
    list.insertAdjacentHTML("beforeend", simpleScheduleRowHtml({ weekdays: [], startMinute: 9 * 60, endMinute: 17 * 60 }));
    updateRemoveButtons();
  });
  list.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-window-remove]");
    if (!remove || list.querySelectorAll("[data-window-row]").length === 1) return;
    remove.closest("[data-window-row]")?.remove();
    updateRemoveButtons();
  });
  list.addEventListener("input", (event) => {
    if (event.target.matches("[data-window-start], [data-window-end]")) {
      updateOvernightIndicator(event.target.closest("[data-window-row]"));
    }
  });
  updateRemoveButtons();
}

function readWeeklyEditor(id) {
  const editor = document.getElementById(id);
  if (!editor) return { windows: [], error: null };
  const windows = [];
  for (const row of editor.querySelectorAll("[data-window-row]")) {
    const weekdays = Array.from(row.querySelectorAll("[data-weekday]:checked"), (input) => Number(input.dataset.weekday));
    if (!weekdays.length) continue;
    const startMinute = timeToMinute(row.querySelector("[data-window-start]").value);
    const endMinute = timeToMinute(row.querySelector("[data-window-end]").value);
    if (startMinute === null || endMinute === null) return { windows: [], error: "Choose a start time and end time for each selected row." };
    if (endMinute === startMinute) return { windows: [], error: "Start and end time cannot be the same." };
    weekdays.forEach((weekday) => windows.push({ weekday, startMinute, endMinute }));
  }
  windows.sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  return { windows, error: null };
}


export function createCommands({ state, ui, renderer, invoke }) {
  // `uiForm` itself isn't destructured here — a local wrapper of the same
  // name is defined further down (it forwards to `ui.uiForm`), and
  // destructuring it too would shadow that declaration in the same scope
  // (a hard SyntaxError, not just a lint issue). The wrapper covers every
  // call site in this file already, including the ones added above.
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

  // Shared builder for the New list / Edit list dialogs — one definition so
  // the two can't drift apart (they used to: New list had no emoji, no color,
  // and no live preview). Renders the preview tile, name field, paged emoji
  // picker, and life-area + effect selects, wires the live preview, and
  // resolves to {name, emoji, color, area, direction} (or undefined if
  // cancelled / name blank). `current` seeds every field; pass `deleteId` to
  // include the Edit-only "Delete list" button.
  //
  // No standalone color field: color is derived from the selected life area
  // (see utils.js's colorForArea), not an independent choice, so every list
  // in the same category reads as the same color rather than something that
  // can drift from the tag. The preview swatch re-derives live off the
  // life-area <select> instead of a color input.
  async function openListForm({ title, confirmText, current, deleteId = null }) {
    // Starts as the given emoji even if it isn't one of the curated picker
    // choices — only changes when a tile is actually clicked, so saving
    // without touching Emoji never swaps a custom pick for the first tile.
    let chosenEmoji = current.emoji;
    let activeCat = (findEmojiCategory(chosenEmoji) || EMOJI_CATEGORIES[0]).key;
    const activeIndex = () => Math.max(0, EMOJI_CATEGORIES.findIndex((c) => c.key === activeCat));
    const activeCategory = () => EMOJI_CATEGORIES[activeIndex()];
    const catGridHtml = () => activeCategory().emojis.map(
      (e) => `<button type="button" class="emoji-opt${e === chosenEmoji ? " sel" : ""}" data-emoji="${e}">${e}</button>`
    ).join("");
    const previewStyle = (color) => `background:${color}22;color:${color};width:32px;height:32px;border-radius:5px;display:grid;place-items:center;font-size:15px;flex:none`;
    const deleteHtml = deleteId
      ? `<button type="button" class="btn danger dfoot-delete" data-action="deleteList" data-id="${deleteId}">Delete list</button>`
      : "";
    // `uiForm` mutates the DOM synchronously before returning its (still
    // pending) promise (see ui.js), so the elements below can be grabbed and
    // wired right after the call rather than via an onMount hook.
    const formPromise = uiForm({
      title,
      confirmText,
      focusSel: "#listNameIn",
      bodyHtml: `
        <div class="ffield"><label>Preview</label><span id="stylePreview" style="${previewStyle(colorForArea(current.lifeArea))}">${chosenEmoji}</span></div>
        <div class="ffield"><label>Name</label><input type="text" id="listNameIn" value="${esc(current.name || "")}" autocomplete="off" autocorrect="off" spellcheck="false" style="flex:1"></div>
        <div class="ffield" style="align-items:flex-start">
          <label>Emoji</label>
          <div class="emoji-picker">
            <div class="emoji-cat-pager">
              <button type="button" class="emoji-cat-nav" id="emojiCatPrev" title="Previous category">◀</button>
              <span class="emoji-cat-label" id="emojiCatLabel">${esc(activeCategory().label)}</span>
              <button type="button" class="emoji-cat-nav" id="emojiCatNext" title="Next category">▶</button>
            </div>
            <div class="emoji-grid" id="emojiGrid">${catGridHtml()}</div>
          </div>
        </div>
        <div class="ffield"><label>Life area</label><select id="listAreaIn">${lifeAreaOptionsHtml(current.lifeArea || "")}</select></div>
        <div class="ffield"><label>Effect</label><select id="listDirIn">${lifeDirOptionsHtml(current.lifeDirection)}</select></div>
        <div class="schedule-field">
          <div class="schedule-field-head"><div><strong>Available here</strong><span>One-time tasks in this list can be planned during these windows.</span></div></div>
          ${simpleScheduleEditorHtml("listAvailabilityIn", current.availabilityWindows || [])}
          <div class="schedule-error" id="listScheduleError"></div>
        </div>`,
      collect: () => {
        const name = document.getElementById("listNameIn").value.trim();
        if (!name) return undefined;
        const schedule = readWeeklyEditor("listAvailabilityIn");
        const scheduleError = document.getElementById("listScheduleError");
        if (schedule.error) {
          if (scheduleError) scheduleError.textContent = schedule.error;
          return undefined;
        }
        const area = document.getElementById("listAreaIn").value || null;
        const direction = area ? document.getElementById("listDirIn").value : null;
        return { name, emoji: chosenEmoji, color: colorForArea(area), area, direction, availabilityWindows: schedule.windows };
      },
    });
    // Wider than the default dialog so each category's 24 emoji fit 2 rows
    // (see "dlg-emoji" in styles.css); removed again once it resolves.
    const modal = document.getElementById("dmodal");
    modal?.classList.add("dlg-emoji");
    if (deleteHtml) modal?.querySelector(".dfoot")?.insertAdjacentHTML("afterbegin", deleteHtml);
    const preview = document.getElementById("stylePreview");
    const areaSelect = document.getElementById("listAreaIn");
    const grid = document.getElementById("emojiGrid");
    const catLabel = document.getElementById("emojiCatLabel");
    const catPrev = document.getElementById("emojiCatPrev");
    const catNext = document.getElementById("emojiCatNext");
    bindWeeklyEditor("listAvailabilityIn");
    grid?.addEventListener("click", (event) => {
      const btn = event.target.closest(".emoji-opt");
      if (!btn) return;
      chosenEmoji = btn.dataset.emoji;
      grid.querySelectorAll(".emoji-opt.sel").forEach((el) => el.classList.remove("sel"));
      btn.classList.add("sel");
      if (preview) preview.textContent = chosenEmoji;
    });
    // Steps categories in place, wrapping at either end (the grid's own click
    // listener stays attached to the same container, so no re-wiring needed).
    const goToCategory = (step) => {
      const count = EMOJI_CATEGORIES.length;
      activeCat = EMOJI_CATEGORIES[(activeIndex() + step + count) % count].key;
      if (catLabel) catLabel.textContent = activeCategory().label;
      if (grid) grid.innerHTML = catGridHtml();
    };
    catPrev?.addEventListener("click", () => goToCategory(-1));
    catNext?.addEventListener("click", () => goToCategory(1));
    // Preview swatch re-colors live as the life area changes — this is the
    // replacement for the old color-input listener, now driven by the
    // derived color instead of a free pick.
    areaSelect?.addEventListener("change", () => {
      if (preview) preview.style.cssText = previewStyle(colorForArea(areaSelect.value || null));
    });
    const value = await formPromise;
    modal?.classList.remove("dlg-emoji");
    return value;
  }

  // `presetArea`: set when this came from a sidebar section's empty-state
  // "+ Start a list" row (see render.js's `sections.map` in renderSidebar)
  // rather than the toolbar's generic New List action — pre-selects that
  // category in the life-area dropdown so the list lands exactly where the
  // user clicked to create it, instead of defaulting to "Unsorted" and
  // making them re-pick the same category they just came from.
  async function addList(presetArea = null) {
    // Full parity with Edit list (name, emoji, life tag) so a list gets its
    // identity at creation, not only afterward. No color to seed here
    // anymore — openListForm derives the preview swatch from `lifeArea`.
    const value = await openListForm({
      title: "New list",
      confirmText: "Create",
      current: { name: "", emoji: "📁", lifeArea: presetArea || "", lifeDirection: "increase", availabilityWindows: [] },
    });
    if (!value) return;
    const snap = await invoke("add_list", { name: value.name });
    // `add_list` always appends (order = previous list count), so the new list
    // is the last entry in the snapshot it returns.
    const created = snap.lists[snap.lists.length - 1];
    if (!created) return apply(snap);
    await invoke("set_list_style", { id: created.id, emoji: value.emoji, color: value.color });
    await invoke("set_list_life_tag", { id: created.id, area: value.area, direction: value.direction });
    apply(await invoke("set_list_availability", { id: created.id, windows: value.availabilityWindows }));
  }

  async function editList(id) {
    const current = list(id);
    if (!current) return;
    const value = await openListForm({ title: "Edit list", confirmText: "Save", current, deleteId: id });
    if (!value) return;
    // Name/style/life-tag each live on their own backend command (matches the
    // existing rename_list vs. set_list_style split); apply the final snapshot.
    await invoke("rename_list", { id, name: value.name });
    await invoke("set_list_style", { id, emoji: value.emoji, color: value.color });
    await invoke("set_list_life_tag", { id, area: value.area, direction: value.direction });
    apply(await invoke("set_list_availability", { id, windows: value.availabilityWindows }));
  }

  async function deleteList(id) {
    if (await uiConfirm("Delete list?", "This deletes the list and all of its tasks.")) {
      apply(await invoke("delete_list", { id }));
    }
  }

  function selectList(id) {
    renderer.navigate({ view: "tasks", listId: id });
  }

  function addTask() {
    if (!state.activeListId) return;
    renderer.openCreateDetail();
    bindWeeklyEditor("newTaskDailyWindows");
  }

  function setCreateTaskChoice(field, value, element) {
    const input = document.getElementById(`task${field}In`);
    if (!input) return;
    const next = field === "ImpactTier" && input.value === value ? "" : value;
    input.value = next;
    element?.closest("[data-choice-group]")?.querySelectorAll("button[data-choice-value]").forEach((button) => {
      button.classList.toggle("sel", button.dataset.choiceValue === next);
    });
    if (field === "Cadence") {
      const daily = next === "daily";
      document.getElementById("newTaskOnceFields")?.classList.toggle("hidden", daily);
      document.getElementById("newTaskDeadlineFields")?.classList.toggle("hidden", daily);
      document.getElementById("newTaskDailyFields")?.classList.toggle("hidden", !daily);
      document.getElementById("newTaskEstimateFields")?.classList.toggle("hidden", daily);
      document.getElementById("newTaskDailySessionSummary")?.classList.toggle("hidden", !daily);
      const hint = document.getElementById("taskCadenceHint");
      if (hint) hint.textContent = daily
        ? "Repeats every day. No finish line and no streak kept."
        : "Finishes once. Its jewel pays on completion.";
    } else if (field === "Depth") {
      const hint = document.getElementById("taskDepthHint");
      if (hint) hint.textContent = next === "deep" ? "Long, focused, hard to interrupt."
        : next === "shallow" ? "Quick, low-focus busywork."
        : "Not classified.";
    } else if (field === "ImpactTier") {
      document.getElementById("newTaskImpactSign")?.classList.toggle("hidden", !next);
    } else if (field === "ImpactSign") {
      input.dataset.explicit = "true";
    }
  }

  async function createTaskFromDetail() {
    const error = document.getElementById("taskCreateError");
    if (error) error.textContent = "";
    const name = document.getElementById("taskNameIn")?.value.trim();
    if (!name) {
      if (error) error.textContent = "Add a task name.";
      document.getElementById("taskNameIn")?.focus();
      return;
    }
    const cadence = document.getElementById("taskCadenceIn")?.value || null;
    const estimateRaw = cadence === "daily" ? "" : (document.getElementById("taskEstIn")?.value.trim() || "");
    const hours = estimateRaw ? parseFloat(estimateRaw) : null;
    if (hours !== null && (isNaN(hours) || hours <= 0)) {
      if (error) error.textContent = "Use a positive estimate, or leave it blank.";
      return;
    }
    const minSessionMin = parseInt(document.getElementById("taskMinSessionIn")?.value, 10) || null;
    const maxSessionMin = parseInt(document.getElementById("taskMaxSessionIn")?.value, 10) || null;
    if (minSessionMin && maxSessionMin && minSessionMin > maxSessionMin) {
      if (error) error.textContent = "The shortest session cannot be longer than the longest session.";
      return;
    }
    const schedule = cadence === "daily" ? readWeeklyEditor("newTaskDailyWindows") : { windows: [], error: null };
    if (schedule.error) {
      if (error) error.textContent = schedule.error;
      return;
    }
    const listId = document.getElementById("taskListIn")?.value || state.activeListId;
    const deadline = document.getElementById("taskDeadlineIn")?.value || "";
    const deadlineAt = deadline ? new Date(deadline + "T00:00:00").getTime() : null;
    const depth = document.getElementById("taskDepthIn")?.value || null;
    const description = document.getElementById("taskNotesIn")?.value.trim() || null;
    const impactTier = document.getElementById("taskImpactTierIn")?.value || null;
    const impactSignInput = document.getElementById("taskImpactSignIn");
    const selectedList = list(listId);
    const impactSign = impactSignInput?.dataset.explicit === "true"
      ? (parseInt(impactSignInput.value, 10) === -1 ? -1 : 1)
      : (selectedList?.lifeDirection === "decrease" ? -1 : 1);
    const beforeIds = new Set(state.S.tasks.map((task) => task.id));
    let snap = await invoke("add_task", { listId, name, estimateMin: hours === null ? null : Math.round(hours * 60) });
    const created = snap.tasks.find((task) => !beforeIds.has(task.id));
    if (!created) return apply(snap);
    if (description) snap = await invoke("set_description", { id: created.id, text: description });
    if (depth) snap = await invoke("set_depth", { id: created.id, depth });
    if (cadence) snap = await invoke("set_cadence", { id: created.id, cadence });
    if (deadlineAt && cadence !== "daily") snap = await invoke("set_deadline", { id: created.id, deadlineAt });
    if (cadence === "daily" && schedule.windows.length) snap = await invoke("set_daily_windows", { id: created.id, windows: schedule.windows });
    if (cadence !== "daily") snap = await invoke("set_session_range", { id: created.id, minMinutes: minSessionMin, maxMinutes: maxSessionMin });
    if (impactTier) snap = await invoke("set_task_impact", { id: created.id, tier: impactTier, sign: impactSign });
    renderer.closeDetail();
    apply(snap);
  }

  async function renameTask(id) {
    const task = findTask(id);
    const name = await uiPrompt("Rename task", task ? task.name : "");
    if (name) apply(await invoke("rename_task", { id, name }));
  }

  // Sets depth to exactly what's passed — no longer a toggle. It used to be
  // (clicking an already-"deep" task's "Mark deep work" menu entry cleared
  // it), back when "deep"/"shallow" were two separate menu buttons. Now
  // they're two options in one 3-way segmented control (Deep/Shallow/None)
  // in the consolidated task panel, so re-clicking the already-selected
  // option should be a harmless no-op, not a surprise clear — and "None" is
  // its own explicit option rather than "click the current one again".
  async function setDepth(id, depth) {
    apply(await invoke("set_depth", { id, depth: depth || null }));
  }

  // Same immediate-commit, exact-value-not-toggle contract as setDepth above.
  // null/"" = one-time (the default), "daily" = repeating — see the Task
  // model's doc comment on `cadence` for what that changes.
  async function setCadence(id, cadence) {
    apply(await invoke("set_cadence", { id, cadence: cadence || null }));
  }

  const detailDailyEditorOptions = (id) => ({
    taskId: id,
    changeAction: "setDailySchedule",
    addAction: "addDailyScheduleRow",
    removeAction: "removeDailyScheduleRow",
  });

  async function persistDailySchedule(id) {
    const result = readWeeklyEditor(`taskDailyWindows-${id}`);
    const error = document.getElementById("taskDailyScheduleError");
    if (result.error) {
      if (error) error.textContent = result.error;
      return;
    }
    if (error) error.textContent = "";
    apply(await invoke("set_daily_windows", { id, windows: result.windows }));
  }

  function addDailyScheduleRow(id) {
    const editor = document.getElementById(`taskDailyWindows-${id}`);
    editor?.querySelector("[data-window-list]")?.insertAdjacentHTML(
      "beforeend",
      simpleScheduleRowHtml({ weekdays: [], startMinute: 9 * 60, endMinute: 17 * 60 }, detailDailyEditorOptions(id)),
    );
  }

  async function removeDailyScheduleRow(id, element) {
    const list = element?.closest("[data-window-list]");
    if (!list || list.querySelectorAll("[data-window-row]").length === 1) return;
    element.closest("[data-window-row]")?.remove();
    await persistDailySchedule(id);
  }

  async function setDailySchedule(id, element) {
    const row = element?.closest("[data-window-row]");
    if (element?.matches("input[type=time]")) updateOvernightIndicator(row);
    if (element?.matches("input[type=time]") && !row?.querySelector("[data-weekday]:checked")) return;
    await persistDailySchedule(id);
  }

  async function setSessionRangeField(id, field, rawValue) {
    const task = findTask(id);
    if (!task || !["min", "max"].includes(field)) return;
    const parsed = (rawValue ?? "").trim() === "" ? null : parseInt(rawValue, 10);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
      renderer.renderDetail();
      return;
    }
    const minMinutes = field === "min" ? parsed : task.minSessionMin;
    const maxMinutes = field === "max" ? parsed : task.maxSessionMin;
    if (minMinutes && maxMinutes && minMinutes > maxMinutes) {
      renderer.renderDetail();
      await uiNote("Adjust the session range", "The shortest session cannot be longer than the longest session.", "OK");
      return;
    }
    apply(await invoke("set_session_range", { id, minMinutes, maxMinutes }));
  }

  async function deleteTask(id) {
    if (await uiConfirm("Delete task?", "This deletes the task and its session history.")) {
      apply(await invoke("delete_task", { id }));
      if (state.openTaskId === id) renderer.closeDetail();
    }
  }

  // Estimate used to be its own dialog (title/body/Save button) round-tripped
  // through uiForm — replaced with a plain inline number field in the task
  // panel (see render.js's renderDetail) that commits on change like every
  // other field there. Blank clears the estimate, same as leaving the old
  // dialog's field empty did.
  async function setEstimateInline(id, rawValue) {
    const raw = (rawValue ?? "").trim();
    if (raw === "") {
      apply(await invoke("set_estimate", { id, minutes: null }));
      return;
    }
    const hours = parseFloat(raw);
    if (isNaN(hours) || hours < 0) return;
    apply(await invoke("set_estimate", { id, minutes: Math.round(hours * 60) }));
  }

  // The "+" step button next to the estimate field bumps it by a flat 1h,
  // on top of whatever's already there (2.25h -> 3.25h) — a fast way to
  // nudge the target up without opening the keyboard, alongside still being
  // able to click into the field and type an exact value (setEstimateInline
  // above, via change). This used to fire on any click on the field itself,
  // but that doubled up awkwardly with the field's own native spinner
  // arrows (also a click on the same element) — a dedicated button, with
  // the native arrows hidden (see .est-inline in styles.css), replaces both.
  async function bumpEstimate(id) {
    const task = findTask(id);
    if (!task) return;
    const currentHours = task.estimateMin ? task.estimateMin / 60 : 0;
    apply(await invoke("set_estimate", { id, minutes: Math.round((currentHours + 1) * 60) }));
  }

  // The decrease counterpart — its own "-" step button, same reasoning as
  // bumpEstimate above. Dropping to 0h or below clears the estimate
  // entirely rather than storing a literal 0 — "no target" is what
  // decreasing all the way down means, not a target of nothing.
  async function decreaseEstimate(id) {
    const task = findTask(id);
    if (!task || !task.estimateMin) return;
    const nextHours = task.estimateMin / 60 - 1;
    apply(await invoke("set_estimate", { id, minutes: nextHours > 0 ? Math.round(nextHours * 60) : null }));
  }

  // Deadline field (see render.js's renderDetail and
  // docs/homepage-now-spec.md) — a plain <input type="date"> that commits on
  // change, same immediate-commit contract as setEstimateInline above.
  // Clearing the date clears the deadline. Stored as midnight-local ms epoch
  // (date granularity only — the Now section only ever needs "which day",
  // not a time-of-day).
  async function setDeadlineInline(id, dateStr) {
    const trimmed = (dateStr ?? "").trim();
    if (trimmed === "") {
      apply(await invoke("set_deadline", { id, deadlineAt: null }));
      return;
    }
    const ms = new Date(trimmed + "T00:00:00").getTime();
    if (isNaN(ms)) return;
    apply(await invoke("set_deadline", { id, deadlineAt: ms }));
  }

  // "Impact" used to be a separate dialog (uiForm/#dmodal), then grew a
  // per-task multi-area weighted split inline in the task panel — both cut
  // back to just these two controls (see utils.js's comment for why). Every
  // control commits immediately, same principle as the depth segmented
  // control: the panel always shows persisted truth, so there's no
  // "unsaved draft" state to lose when an unrelated state-changed event
  // re-renders it.
  async function setImpactTier(id, tier) {
    const task = findTask(id);
    if (!task) return;
    // Clicking the already-selected tier clears it — same toggle feel as
    // the old dial's click handler had, just persisted instead of local.
    const next = task.impactTier === tier ? null : tier;
    let sign = task.impactSign === -1 ? -1 : 1;
    // The first time a tier is set on a task, default its direction to
    // match its list's own Effect (see "Edit list") instead of always
    // starting at "For" — a task in a "decreases this area" list should
    // start out already pointing the same way as the list, not silently
    // contradicting it until someone notices and flips the toggle by hand.
    // Once a tier already exists, an explicit sign choice is left alone
    // (this only seeds the *default*, not a standing override).
    if (next && !task.impactTier) {
      const taskList = list(task.listId);
      sign = taskList && taskList.lifeDirection === "decrease" ? -1 : 1;
    }
    apply(await invoke("set_task_impact", { id, tier: next, sign }));
  }

  async function setImpactSign(id, sign) {
    const task = findTask(id);
    if (!task) return;
    apply(await invoke("set_task_impact", { id, tier: task.impactTier || null, sign: parseInt(sign, 10) === -1 ? -1 : 1 }));
  }

  async function toggleDone(id) {
    apply(await invoke("set_done", { id }));
  }

  // Same story as setEstimateInline above — "Change" used to open its own
  // dialog just to pick one dropdown value; now the list name itself in the
  // task panel *is* the dropdown (a plain <select>, see render.js), and
  // choosing a different list commits immediately on change.
  async function moveTaskInline(id, listId) {
    if (!listId) return;
    const task = findTask(id);
    if (!task || task.listId === listId) return;
    apply(await invoke("move_task", { id, listId }));
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

  async function reorderLifeAreas(orderedAreaKeys) {
    apply(await invoke("reorder_life_areas", { orderedAreaKeys }));
  }

  function showLifePriorityInfo() {
    return uiNote(
      "Planning priority",
      `<p>Life areas are ordered from highest to lowest planning priority.</p>
       <p>Hover over a life area and drag its handle to change the order. When time windows conflict, an area may use time belonging to areas below it—not areas above it.</p>
       <p><strong>Example:</strong> If Relationships is above Career / Work, a Relationships task can use a Work window. A Work task cannot use time reserved for Relationships.</p>`,
    );
  }

  // The keyboard shortcuts cheat sheet — shown from the `?` key and from
  // Settings > Keyboard. Single source so the two never drift.
  function showShortcuts() {
    const rows = [
      ["Tab", "Next region"], ["⇧ Tab", "Previous region"],
      ["j / k", "Move down / up in region"], ["Enter", "Open list / play task"],
      ["n", "New list / task / session (by region)"],
      ["Space", "Play / pause current"], ["i", "Insights"], ["s", "Settings"],
      ["/", "Search"], ["⌘+ / ⌘− / ⌘0", "Zoom in / out / reset"], ["⌘[ / ⌘]", "Back / forward"],
      ["?", "This help"], ["Esc", "Clear focus"],
    ];
    const body = `<div style="display:grid;grid-template-columns:auto 1fr;gap:9px 16px;align-items:center">`
      + rows.map(([k, d]) => `<kbd style="justify-self:start;background:var(--bg3);border-radius:4px;padding:2px 8px;font-family:monospace;font-size:12px;color:#fff">${k}</kbd><span style="color:var(--muted);font-size:13px">${d}</span>`).join("")
      + `</div>`;
    uiNote("Keyboard shortcuts", body);
  }

  // Re-file a list into a life area by dragging it onto a sidebar section
  // header (see renderSidebar in render.js). Reuses the same set_list_life_tag
  // command the edit-list dialog uses. Moving to "Unsorted" (area = null)
  // clears the for/against direction too, since a direction with no area is
  // meaningless; moving between real areas keeps the existing direction.
  async function setListArea(id, area) {
    const current = list(id);
    if (!current) return;
    const normalized = area || null;
    const direction = normalized ? (current.lifeDirection || null) : null;
    // Color is derived from the area (see colorForArea / openListForm's doc
    // comment) — re-filing a list via drag-and-drop changes its category
    // just as much as the Edit dialog does, so it needs the same recolor,
    // not just the tag update the old single `set_list_life_tag` call did.
    await invoke("set_list_style", { id, emoji: current.emoji, color: colorForArea(normalized) });
    apply(await invoke("set_list_life_tag", { id, area: normalized, direction }));
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

  // Inline Notes fields in task detail and the Now Playing page commit from
  // their <textarea> on blur — same immediate-commit contract as every other
  // inline field — rather than opening the dialog above. editLyrics stays for
  // the standalone Lyrics overlay.
  async function setLyricsInline(id, text) {
    const snap = await invoke("set_description", { id, text: (text ?? "").trim() || null });
    apply(snap);
    if (state.lyricsId === id) renderer.renderLyrics();
  }

  async function addSession(taskId) {
    if (!state.S) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateValue = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeValue = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const endDefault = new Date(now.getTime() + 25 * 60000);
    const endValue = `${pad(endDefault.getHours())}:${pad(endDefault.getMinutes())}`;
    const body = `
      <div class="dbody">Log time you already spent on this task.</div>
      <div class="ffield"><label>Date</label><input type="date" id="sfDate" value="${dateValue}" max="${dateValue}"></div>
      <div class="ffield"><label>Start</label><input type="time" id="sfTime" value="${timeValue}"></div>
      <div class="ffield"><label>End</label><input type="time" id="sfEnd" value="${endValue}"></div>`;
    const value = await uiForm({
      title: "Add session",
      confirmText: "Add",
      focusSel: "#sfEnd",
      bodyHtml: body,
      // End is a bare time input with no date of its own — a session ending
      // past midnight (end <= start on the same calendar date) rolls onto
      // the next day rather than being read as a negative-length session.
      collect: () => {
        const date = document.getElementById("sfDate").value;
        const time = document.getElementById("sfTime").value || "00:00";
        const endTime = document.getElementById("sfEnd").value;
        if (!date || !endTime) return undefined;
        const start = new Date(`${date}T${time}`).getTime();
        let end = new Date(`${date}T${endTime}`).getTime();
        if (isNaN(start) || isNaN(end)) return undefined;
        if (end <= start) end += 86400000;
        return { start, end };
      },
    });
    if (value) apply(await invoke("add_session", { taskId, start: value.start, end: value.end }));
  }

  async function editSession(id) {
    if (!state.S) return;
    const session = state.S.sessions.find((item) => item.id === id);
    if (!session) return;
    const start = new Date(session.start);
    const end = new Date(session.end ?? Date.now());
    const pad = (n) => String(n).padStart(2, "0");
    const dateValue = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    const timeValue = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const endValue = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
    const body = `
      <div class="dbody">Adjust when this session started and ended.</div>
      <div class="ffield"><label>Date</label><input type="date" id="sfDate" value="${dateValue}"></div>
      <div class="ffield"><label>Start</label><input type="time" id="sfTime" value="${timeValue}"></div>
      <div class="ffield"><label>End</label><input type="time" id="sfEnd" value="${endValue}"></div>`;
    const value = await uiForm({
      title: "Edit session",
      confirmText: "Save",
      focusSel: "#sfEnd",
      bodyHtml: body,
      collect: () => {
        const date = document.getElementById("sfDate").value;
        const time = document.getElementById("sfTime").value || "00:00";
        const endTime = document.getElementById("sfEnd").value;
        if (!date || !endTime) return undefined;
        const newStart = new Date(`${date}T${time}`).getTime();
        let newEnd = new Date(`${date}T${endTime}`).getTime();
        if (isNaN(newStart) || isNaN(newEnd)) return undefined;
        if (newEnd <= newStart) newEnd += 86400000;
        return { start: newStart, end: newEnd };
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

  // Jumps to System Settings' Notifications pane. macOS ties a per-app
  // "Banners" (auto-dismiss) vs "Alerts" (stays until dismissed) choice to a
  // user preference the app can't set or read for itself — the best we can
  // do is get the user to the right screen. See the Settings notification
  // hint (soundPickersHtml) for the button that calls this.
  async function openNotificationSettings() {
    try {
      await invoke("open_url", { url: "x-apple.systempreferences:com.apple.preference.notifications" });
    } catch (error) {
      await uiNote("Couldn't open Notification settings", esc(String(error)), "OK");
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

  async function revealLogs() {
    try {
      await invoke("reveal_logs");
    } catch (error) {
      await uiNote("Couldn't open the log file", esc(String(error)), "OK");
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

  // Self-update — checks the endpoint configured in tauri.conf.json (the
  // repo's own GitHub Releases, see scripts/release.sh), and if it finds a
  // newer signed build, always asks before doing anything: this can be
  // triggered silently on launch (see main.js), so the "you're up to date"
  // no-op message is the only part `silent` suppresses — an actual update
  // still always surfaces the confirm dialog below, launch or not.
  async function checkForUpdates({ silent = false } = {}) {
    state.checkingForUpdate = true;
    renderer.renderSettingsPage();
    try {
      const info = await invoke("check_for_update");
      state.updateInfo = info || null;
      state.checkingForUpdate = false;
      renderer.renderSettingsPage();
      if (info) {
        await promptInstallUpdate();
      } else if (!silent) {
        await uiNote("You're up to date", `TaskPlayer ${esc(state.S?.appVersion || "")} is the newest version.`);
      }
    } catch (error) {
      state.checkingForUpdate = false;
      renderer.renderSettingsPage();
      if (!silent) await uiNote("Couldn't check for updates", esc(String(error)), "OK");
    }
  }

  async function promptInstallUpdate() {
    const info = state.updateInfo;
    if (!info) return;
    const notes = (info.notes || "").trim();
    // Not uiConfirm — that wrapper is hard-coded `danger: true` (red button),
    // meant for destructive actions like deleting a task. Installing an
    // update isn't dangerous, so this builds the same shape by hand.
    const ok = await uiForm({
      title: `Update to ${info.version}?`,
      confirmText: "Download & install",
      bodyHtml: `<div class="dbody">TaskPlayer will download it and restart.${notes ? `<br><br><span style="color:#fff">${esc(notes)}</span>` : ""}</div>`,
      collect: () => true,
    });
    if (!ok) return;
    state.installingUpdate = true;
    renderer.renderSettingsPage();
    try {
      await invoke("install_update");
      // Rust calls app.restart() right after a successful install, so the
      // app relaunches on its own — this line is only reached on failure.
    } catch (error) {
      state.installingUpdate = false;
      renderer.renderSettingsPage();
      await uiNote("Update failed", esc(String(error)), "OK");
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

  // Compatibility action for an old synced `awaiting_break` state.
  async function startBreak() {
    apply(await invoke("start_break"));
  }

  // Compatibility action for an old synced `awaiting_work` state.
  async function resumeWork() {
    apply(await invoke("resume_work"));
  }

  async function setMode(mode) {
    apply(await invoke("set_mode", { mode }));
  }

  async function setConfigField(key, value) {
    // NaN (cleared number input) still falls back to 1, but a real 0 must
    // survive — the hourlyNudge checkbox sends "0" to mean off, and the old
    // `|| 1` would have silently re-enabled it. Numeric fields are unhurt:
    // the backend clamps them to >= 1 anyway.
    const parsed = parseInt(value, 10);
    apply(await invoke("set_config_field", { key, value: Number.isNaN(parsed) ? 1 : parsed }));
    renderer.renderSettingsPage();
  }

  async function setConfigSound(key, value) {
    apply(await invoke("set_config_sound", { key, value }));
    renderer.renderSettingsPage();
  }

  function uiForm({ title, bodyHtml = "", confirmText = "OK", danger = false, focusSel = null, collect }) {
    return ui.uiForm({ title, bodyHtml, confirmText, danger, focusSel, collect });
  }

  return {
    addList,
    editList,
    reorderLists,
    reorderLifeAreas,
    showLifePriorityInfo,
    setListArea,
    showShortcuts,
    deleteList,
    selectList,
    addTask,
    setCreateTaskChoice,
    createTaskFromDetail,
    renameTask,
    setDepth,
    setCadence,
    addDailyScheduleRow,
    removeDailyScheduleRow,
    setDailySchedule,
    setSessionRangeField,
    deleteTask,
    setEstimateInline,
    bumpEstimate,
    decreaseEstimate,
    setDeadlineInline,
    setImpactTier,
    setImpactSign,
    toggleDone,
    moveTaskInline,
    reorderTasks,
    setAlbum,
    moveTaskToAlbum,
    editLyrics,
    setLyricsInline,
    addSession,
    editSession,
    deleteSession,
    openTrackLink,
    openNotificationSettings,
    exportData,
    importData,
    revealLogs,
    play,
    stop,
    skipBreak,
    startBreak,
    resumeWork,
    setMode,
    setConfigField,
    setConfigSound,
    signInGoogle,
    signOut,
    syncNow,
    fullSync,
    checkForUpdates,
    promptInstallUpdate,
    apply,
    uiForm,
  };
}
