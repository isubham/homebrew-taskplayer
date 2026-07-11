import { esc, LIFE_AREAS } from "./utils.js";

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

  async function addList() {
    // A small form instead of the old single uiPrompt so a list can be
    // tagged for the Home page's life-balance radar right at creation, not
    // just later via "Edit list" — emoji/color still default (editable
    // afterward) to keep this quick.
    const value = await uiForm({
      title: "New list",
      confirmText: "Create",
      focusSel: "#newListNameIn",
      bodyHtml: `
        <div class="ffield"><label>Name</label><input type="text" id="newListNameIn" autocomplete="off" autocorrect="off" spellcheck="false" style="flex:1"></div>
        <div class="ffield"><label>Life area</label><select id="newListAreaIn">${lifeAreaOptionsHtml("")}</select></div>
        <div class="ffield"><label>Effect</label><select id="newListDirIn">${lifeDirOptionsHtml("increase")}</select></div>`,
      collect: () => {
        const name = document.getElementById("newListNameIn").value.trim();
        if (!name) return undefined;
        const area = document.getElementById("newListAreaIn").value || null;
        const direction = area ? document.getElementById("newListDirIn").value : null;
        return { name, area, direction };
      },
    });
    if (!value) return;
    const snap = await invoke("add_list", { name: value.name });
    // `add_list` always appends (order = previous list count), so the new
    // list is the last entry in the snapshot it returns.
    const created = snap.lists[snap.lists.length - 1];
    if (value.area && created) {
      apply(await invoke("set_list_life_tag", { id: created.id, area: value.area, direction: value.direction }));
    } else {
      apply(snap);
    }
  }

  async function editList(id) {
    const current = list(id);
    if (!current) return;
    // Starts as the list's actual current emoji, even if it's not one of
    // the curated picker choices (e.g. an older custom pick) — it only ever
    // changes when a tile is actually clicked below, so opening this dialog
    // and hitting Save without touching Emoji can never silently swap a
    // custom emoji out for whatever the picker's first tile happens to be.
    let chosenEmoji = current.emoji;
    // Opens on whichever category already contains the current emoji, so
    // editing a list doesn't land on an unrelated page with nothing
    // highlighted; falls back to the first category for an emoji that
    // isn't in the curated set at all.
    let activeCat = (findEmojiCategory(chosenEmoji) || EMOJI_CATEGORIES[0]).key;
    const activeIndex = () => Math.max(0, EMOJI_CATEGORIES.findIndex((c) => c.key === activeCat));
    const activeCategory = () => EMOJI_CATEGORIES[activeIndex()];
    const catGridHtml = () => activeCategory().emojis.map(
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
        <div class="ffield"><label>Color</label><input type="color" id="listColorIn" value="${esc(current.color)}"></div>
        <div class="ffield"><label>Life area</label><select id="listAreaIn">${lifeAreaOptionsHtml(current.lifeArea)}</select></div>
        <div class="ffield"><label>Effect</label><select id="listDirIn">${lifeDirOptionsHtml(current.lifeDirection)}</select></div>
        <div style="margin:18px 22px 0;padding-top:14px;border-top:1px solid var(--line)">
          <button type="button" class="danger" data-action="deleteList" data-id="${id}">Delete list</button>
        </div>`,
      collect: () => {
        const name = document.getElementById("listNameIn").value.trim();
        if (!name) return undefined;
        const color = document.getElementById("listColorIn").value;
        const area = document.getElementById("listAreaIn").value || null;
        const direction = area ? document.getElementById("listDirIn").value : null;
        return { name, emoji: chosenEmoji, color, area, direction };
      },
    });
    // This dialog's emoji picker needs more width than the shared dialog
    // default (see "dlg-emoji" in styles.css) to fit each category's 24
    // emoji at 2 rows instead of scrolling — scoped to a class toggled on
    // just this instance of #dmodal, not a change to `.dlg` itself, so
    // every other dialog in the app (uiPrompt/uiConfirm/addList/moveTask/
    // etc.) keeps its normal, narrower width. Removed again once this
    // dialog resolves, regardless of Save or Cancel.
    const modal = document.getElementById("dmodal");
    modal?.classList.add("dlg-emoji");
    // The grid's own highlighted tile and the color swatch both show the
    // current pick, but neither made it obvious *something changed* when
    // clicked — this preview is the one place both come together, updated
    // live so picking either one has an immediate, unambiguous result.
    const preview = document.getElementById("stylePreview");
    const colorInput = document.getElementById("listColorIn");
    const grid = document.getElementById("emojiGrid");
    const catLabel = document.getElementById("emojiCatLabel");
    const catPrev = document.getElementById("emojiCatPrev");
    const catNext = document.getElementById("emojiCatNext");
    grid?.addEventListener("click", (event) => {
      const btn = event.target.closest(".emoji-opt");
      if (!btn) return;
      chosenEmoji = btn.dataset.emoji;
      grid.querySelectorAll(".emoji-opt.sel").forEach((el) => el.classList.remove("sel"));
      btn.classList.add("sel");
      if (preview) preview.textContent = chosenEmoji;
    });
    // Steps to the previous/next category and re-renders #emojiGrid's
    // contents in place (the listener above stays attached to the same
    // container element, so re-wiring it isn't needed). Wraps around at
    // either end (last → first, first → last) rather than disabling the
    // button, since "which page am I on" is a loop, not a line — a per-
    // category icon-tab row read this same information less clearly than
    // just naming the category being paged to.
    const goToCategory = (step) => {
      const count = EMOJI_CATEGORIES.length;
      activeCat = EMOJI_CATEGORIES[(activeIndex() + step + count) % count].key;
      if (catLabel) catLabel.textContent = activeCategory().label;
      if (grid) grid.innerHTML = catGridHtml();
    };
    catPrev?.addEventListener("click", () => goToCategory(-1));
    catNext?.addEventListener("click", () => goToCategory(1));
    colorInput?.addEventListener("input", () => {
      if (preview) preview.style.cssText = previewStyle(colorInput.value);
    });
    const value = await formPromise;
    modal?.classList.remove("dlg-emoji");
    if (!value) return;
    // Name/style/life-tag each live on their own backend command (matches
    // the existing rename_list vs. set_list_style split) — all three fire
    // from this one dialog, so just apply the final snapshot.
    await invoke("rename_list", { id, name: value.name });
    await invoke("set_list_style", { id, emoji: value.emoji, color: value.color });
    apply(await invoke("set_list_life_tag", { id, area: value.area, direction: value.direction }));
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

  // The task panel's own Notes field (see render.js's renderDetail) commits
  // straight from its <textarea> on blur — same immediate-commit contract
  // as every other field there — rather than opening the dialog above.
  // editLyrics itself is left in place: the standalone Lyrics overlay and
  // the Now Playing rail's Lyrics card still open that dialog, since they
  // aren't part of the field-editing panel this one is scoped to.
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

  // The button shown while `run.phase === "awaiting_break"` — the work block
  // already ended and got logged; the break clock only starts now.
  async function startBreak() {
    apply(await invoke("start_break"));
  }

  // The button shown while `run.phase === "awaiting_work"` — same underlying
  // command as skipBreak (both just mean "resume work now"), kept as its own
  // named action so the two buttons read clearly in bootstrap.js/render.js.
  async function resumeWork() {
    apply(await invoke("resume_work"));
  }

  async function setMode(mode) {
    apply(await invoke("set_mode", { mode }));
    renderer.renderSettingsPage();
  }

  async function setConfigField(key, value) {
    apply(await invoke("set_config_field", { key, value: parseInt(value, 10) || 1 }));
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
    deleteList,
    selectList,
    addTask,
    renameTask,
    setDepth,
    deleteTask,
    setEstimateInline,
    bumpEstimate,
    decreaseEstimate,
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
