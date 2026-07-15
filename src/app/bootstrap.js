import { createAppState } from "./state.js";
import { createUi } from "./ui.js";
import { createRenderer } from "./render.js";
import { createCommands } from "./commands.js";
import { animate } from "../vendor/motion.js";

export function bootstrapApp() {
  const appState = createAppState();
  const ui = createUi();
  const renderer = createRenderer({ state: appState.state, helpers: appState, actions: null });
  const commands = createCommands({ state: appState.state, ui, renderer, invoke: window.__TAURI__.core.invoke });

  const ZOOM_MIN = 0.8;
  const ZOOM_MAX = 1.3;
  const ZOOM_STEP = 0.1;
  let savedZoom = 1;
  try { savedZoom = Number.parseFloat(localStorage.getItem("tp.zoom") || "1"); } catch (_) { /* use 100% */ }
  let zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(savedZoom) ? savedZoom : 1));
  let appliedZoom = 1;
  let zoomQueue = Promise.resolve();
  let zoomRequestId = 0;
  const persistZoom = (level) => {
    try { localStorage.setItem("tp.zoom", String(level)); } catch (_) { /* non-fatal */ }
  };
  const setZoom = (next) => {
    zoomLevel = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 10) / 10;
    const requested = zoomLevel;
    const requestId = ++zoomRequestId;
    zoomQueue = zoomQueue.then(async () => {
      await window.__TAURI__.core.invoke("set_app_zoom", { scale: requested });
      appliedZoom = requested;
      if (requestId === zoomRequestId) persistZoom(requested);
    }).catch(() => {
      if (requestId === zoomRequestId) {
        zoomLevel = appliedZoom;
        persistZoom(appliedZoom);
      }
    });
  };
  setZoom(zoomLevel);

  const dispatchAction = async (action, payload = {}) => {
    const { event, element, id, value, key, overlay, view, listId, mode } = payload;
    switch (action) {
      case "addList": return commands.addList();
      case "addListInArea": return commands.addList(payload.area || null);
      case "editList": return commands.editList(id);
      case "deleteList": return commands.deleteList(id);
      case "selectList": return commands.selectList(id);
      case "addTask": return commands.addTask();
      case "setCreateTaskChoice": return commands.setCreateTaskChoice(payload.choiceField, payload.choiceValue ?? "", element);
      case "createTaskFromDetail": return commands.createTaskFromDetail();
      case "renameTask": return commands.renameTask(id);
      case "setDepth": return commands.setDepth(id, payload.depth ?? value);
      case "setCadence": return commands.setCadence(id, payload.cadence ?? value);
      case "addDailyScheduleRow": return commands.addDailyScheduleRow(id);
      case "removeDailyScheduleRow": return commands.removeDailyScheduleRow(id, element);
      case "setDailySchedule": return commands.setDailySchedule(id, element);
      case "setSessionRangeField": return commands.setSessionRangeField(id, payload.rangeField, value);
      case "deleteTask": return commands.deleteTask(id);
      case "setEstimateInline": return commands.setEstimateInline(id, value);
      case "bumpEstimate": return commands.bumpEstimate(id);
      case "decreaseEstimate": return commands.decreaseEstimate(id);
      case "setDeadlineInline": return commands.setDeadlineInline(id, value);
      case "setImpactTier": return commands.setImpactTier(id, payload.tier);
      case "setImpactSign": return commands.setImpactSign(id, payload.sign);
      case "toggleDone": return commands.toggleDone(id);
      case "moveTaskInline": return commands.moveTaskInline(id, value);
      case "reorderTasks": return commands.reorderTasks(listId, payload.orderedIds);
      case "reorderLists": return commands.reorderLists(payload.orderedIds);
      case "reorderLifeAreas": return commands.reorderLifeAreas(payload.orderedAreaKeys);
      case "showLifePriorityInfo": return commands.showLifePriorityInfo();
      case "setListArea": return commands.setListArea(id, payload.area);
      case "toggleAreaSection": return renderer.toggleAreaSection(payload.area);
      case "toggleAllAreaSections": return renderer.toggleAllAreaSections();
      case "toggleLifeAgainst": return renderer.toggleLifeAgainst();
      case "selectAgainstArea": return renderer.selectAgainstArea(payload.key);
      case "toggleKeybindings": return renderer.toggleKeybindings();
      case "showShortcuts": return commands.showShortcuts();
      case "setAlbum": return commands.setAlbum(id);
      case "moveTaskToAlbum": return commands.moveTaskToAlbum(id, value);
      case "editLyrics": return commands.editLyrics(id);
      case "setLyricsInline": return commands.setLyricsInline(id, value);
      case "addSession": return commands.addSession(id);
      case "toggleSessionGroup": return renderer.toggleSessionGroup(payload.day, id);
      case "selectGridCell": return renderer.selectGridCell(key, value);
      case "setInsightsPeriod": return renderer.setInsightsPeriod(value);
      case "editSession": return commands.editSession(id);
      case "deleteSession": return commands.deleteSession(id);
      case "exportData": return commands.exportData();
      case "importData": return commands.importData();
      case "revealLogs": return commands.revealLogs();
      case "signInGoogle": return commands.signInGoogle();
      case "signOut": return commands.signOut();
      case "syncNow": return commands.syncNow();
      case "fullSync": return commands.fullSync();
      case "checkForUpdates": return commands.checkForUpdates();
      case "promptInstallUpdate": return commands.promptInstallUpdate();
      case "play": return commands.play(id);
      case "stop": return commands.stop();
      case "skipBreak": return commands.skipBreak();
      case "startBreak": return commands.startBreak();
      case "resumeWork": return commands.resumeWork();
      case "setMode": return commands.setMode(value || mode || "open");
      case "setConfigField": return commands.setConfigField(key, value ?? element?.value ?? "");
      case "setConfigSound": return commands.setConfigSound(key, value ?? element?.value ?? "");
      case "cycleMode": {
        const order = ["open", "target", "pomodoro"];
        const modeValue = appState.state.S?.config?.mode;
        const next = modeValue ? order[(order.indexOf(modeValue) + 1) % order.length] : "open";
        return commands.setMode(next);
      }
      case "openNowPlaying": return renderer.openNowPlaying();
      case "navigate": return renderer.navigate({ view: view || "tasks", listId: listId || null });
      case "goBack": return renderer.goBack();
      case "goForward": return renderer.goForward();
      case "goHome": return renderer.goHome();
      case "searchGoList": return renderer.searchGoList(id);
      case "searchGoTask": return renderer.searchGoTask(id);
      case "openSettingsPage": return renderer.openSettingsPage();
      case "openInsightsPage": return renderer.openInsightsPage();
      case "toggleCompleted": return renderer.toggleCompleted();
      case "openRowMenu": return renderer.openRowMenu(element, id);
      case "rowMenu": return renderer.rowMenu(payload.action ?? value, id);
      case "closeRowMenu": return renderer.closeRowMenu();
      case "openDetail": return renderer.openDetail(id);
      case "closeDetail": return renderer.closeDetail();
      case "renderDetail": return renderer.renderDetail();
      case "openLyrics": return renderer.openLyrics(id);
      case "closeLyrics": return renderer.closeLyrics();
      case "renderLyrics": return renderer.renderLyrics();
      case "renderSettingsPage": return renderer.renderSettingsPage();
      case "closeOverlay": {
        if (event?.target !== element) return undefined;
        if (overlay === "detail") return renderer.closeDetail();
        if (overlay === "lyrics") return renderer.closeLyrics();
        if (overlay === "track") return renderer.closeTrackDetail();
        return undefined;
      }
      case "musicSetGenre": {
        if (window.Music?.setGenre) window.Music.setGenre(value);
        return undefined;
      }
      case "musicNext": {
        window.Music?.next?.();
        return undefined;
      }
      case "musicSetVolume": {
        window.Music?.setVolume?.(value);
        return undefined;
      }
      case "openTrackDetail": return renderer.openTrackDetail();
      case "closeTrackDetail": return renderer.closeTrackDetail();
      case "openTrackLink": return commands.openTrackLink(value);
      case "openNotificationSettings": return commands.openNotificationSettings();
      default: return undefined;
    }
  };

  renderer.actions = dispatchAction;

  document.addEventListener("click", async (event) => {
    const popmenu = document.getElementById("popmenu");
    if (popmenu.classList.contains("show") && !popmenu.contains(event.target) && !event.target.closest(".menu-btn")) {
      renderer.closeRowMenu();
    }

    // The life-area priority grip belongs inside a clickable collapse header;
    // clicking or finishing a drag on the grip must not also fold the area.
    if (event.target.closest(".ls-priority-grip")) return;
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    // Form controls (the pomodoro/target-length number inputs, the music
    // genre <select>) carry data-action purely so the "change" listener
    // below can pick them up when a value is actually committed — they have
    // no business also being a *click* trigger. Without this guard, clicking
    // into one of these to focus it (before typing anything, or before
    // picking a <select> option) fired the action immediately with a bogus
    // empty value, and the resulting re-render replaced the input out from
    // under the cursor — which looked exactly like "can't edit this field."
    if (["INPUT", "SELECT", "TEXTAREA"].includes(trigger.tagName)) return;
    const action = trigger.dataset.action;
    if (trigger.dataset.stopPropagation === "true") {
      event.preventDefault();
      event.stopPropagation();
    }
    if (action === "closeOverlay" && event.target !== trigger) return;
    const payload = { ...trigger.dataset, event, element: trigger, id: trigger.dataset.id ?? null, value: trigger.dataset.value ?? null, key: trigger.dataset.key ?? null, overlay: trigger.dataset.overlay ?? null, view: trigger.dataset.view ?? null, listId: trigger.dataset.listId ?? null, action: trigger.dataset.actionName ?? null, depth: trigger.dataset.depth ?? null, mode: trigger.dataset.mode ?? null };
    await dispatchAction(action, payload);
  });

  document.addEventListener("change", async (event) => {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    const action = trigger.dataset.action;
    // Checkboxes carry their state in `checked`, not `value` (which is a
    // constant "on") — normalized to "1"/"0" so actions can parseInt it the
    // same way as every number input.
    const value = event.target.type === "checkbox" ? (event.target.checked ? "1" : "0") : event.target.value;
    const payload = { ...trigger.dataset, event, element: trigger, id: trigger.dataset.id ?? null, value, key: trigger.dataset.key ?? null, overlay: trigger.dataset.overlay ?? null, view: trigger.dataset.view ?? null, listId: trigger.dataset.listId ?? null, action: trigger.dataset.actionName ?? null, depth: trigger.dataset.depth ?? null, mode: trigger.dataset.mode ?? null };
    await dispatchAction(action, payload);
  });

  // Drag-and-drop reordering for the to-do table. Rows carry data-drag-id /
  // data-list-id / data-album (see render.js); the whole row is draggable
  // (not just the grip glyph) since a real drag gesture is easy for the
  // browser to tell apart from the plain click that starts/stops the task.
  // Tasks are grouped into album sections (each its own <table>), so a drop
  // that lands on a row belonging to a *different* album also reassigns the
  // dragged task to that album — dragging a task into another album's block
  // moves it there, the way you'd drag a track into a different playlist.
  let dragId = null;
  let dragAlbum = "";

  document.addEventListener("dragstart", (event) => {
    const row = event.target.closest("tr[data-drag-id]");
    if (!row) return;
    dragId = row.dataset.dragId;
    dragAlbum = row.dataset.album || "";
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragId);
    requestAnimationFrame(() => row.classList.add("dragging"));
  });

  document.addEventListener("dragover", (event) => {
    if (!dragId) return;
    // Album headers (and the "Singles" label / empty-state box) are also
    // valid drop targets — dropping there just moves the task into/out of
    // that album without needing to land precisely on a row.
    const zone = event.target.closest("[data-album-drop]");
    if (zone) {
      event.preventDefault();
      document.querySelectorAll(".drag-over-top,.drag-over-bottom,.drop-zone-over").forEach((el) => el.classList.remove("drag-over-top", "drag-over-bottom", "drop-zone-over"));
      zone.classList.add("drop-zone-over");
      return;
    }
    const row = event.target.closest("tr[data-drag-id]");
    if (!row) return;
    event.preventDefault();
    const before = event.clientY - row.getBoundingClientRect().top < row.offsetHeight / 2;
    document.querySelectorAll("tr.drag-over-top,tr.drag-over-bottom,.drop-zone-over").forEach((other) => {
      if (other !== row) other.classList.remove("drag-over-top", "drag-over-bottom", "drop-zone-over");
    });
    row.classList.toggle("drag-over-top", before);
    row.classList.toggle("drag-over-bottom", !before);
  });

  document.addEventListener("drop", async (event) => {
    if (!dragId) return;
    const zone = event.target.closest("[data-album-drop]");
    if (zone) {
      event.preventDefault();
      zone.classList.remove("drop-zone-over");
      const targetAlbum = zone.dataset.albumDrop || "";
      if (targetAlbum !== dragAlbum) {
        await dispatchAction("moveTaskToAlbum", { id: dragId, value: targetAlbum });
      }
      dragId = null;
      dragAlbum = "";
      return;
    }
    const row = event.target.closest("tr[data-drag-id]");
    if (!row) return;
    event.preventDefault();
    const before = event.clientY - row.getBoundingClientRect().top < row.offsetHeight / 2;
    row.classList.remove("drag-over-top", "drag-over-bottom");
    const targetId = row.dataset.dragId;
    const listId = row.dataset.listId;
    const targetAlbum = row.dataset.album || "";
    if (targetId !== dragId) {
      // Rows live across multiple sibling <table>s (one per album section),
      // but selecting by data-list-id still walks them in the same
      // top-to-bottom document order the user sees, so the reorder is
      // computed exactly as it was before album grouping existed.
      const ids = Array.from(document.querySelectorAll(`tr[data-list-id="${listId}"]`)).map((r) => r.dataset.dragId);
      const from = ids.indexOf(dragId);
      if (from !== -1) {
        ids.splice(from, 1);
        let to = ids.indexOf(targetId);
        if (to === -1) to = ids.length;
        else if (!before) to += 1;
        ids.splice(to, 0, dragId);
        await dispatchAction("reorderTasks", { listId, orderedIds: ids });
      }
      if (targetAlbum !== dragAlbum) {
        await dispatchAction("moveTaskToAlbum", { id: dragId, value: targetAlbum });
      }
    }
    dragId = null;
    dragAlbum = "";
  });

  document.addEventListener("dragend", () => {
    document.querySelectorAll(".dragging").forEach((row) => row.classList.remove("dragging"));
    document.querySelectorAll(".drag-over-top,.drag-over-bottom,.drop-zone-over").forEach((row) => row.classList.remove("drag-over-top", "drag-over-bottom", "drop-zone-over"));
    dragId = null;
    dragAlbum = "";
  });

  // Drag-and-drop reordering for the sidebar's list of lists — same pattern
  // as the task-row reordering above (own dragId so the two gestures never
  // interfere), just scoped to .list-item[data-drag-list-id] instead of
  // tr[data-drag-id], and with no grouping key since there's only ever one
  // sidebar list to reorder within.
  let listDragId = null;
  let areaDragKey = null;
  let areaDropIndex = null;

  const priorityHeaders = () => Array.from(document.querySelectorAll("#lists .ls-header[data-priority-area]"));

  function prioritySectionPositions() {
    return new Map(priorityHeaders().map((header) => [
      header.dataset.priorityArea,
      header.closest(".list-section")?.getBoundingClientRect(),
    ]));
  }

  function animatePriorityReorder(previousPositions) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    priorityHeaders().forEach((header) => {
      const section = header.closest(".list-section");
      const previous = previousPositions.get(header.dataset.priorityArea);
      if (!section || !previous) return;
      const deltaY = previous.top - section.getBoundingClientRect().top;
      if (Math.abs(deltaY) < 1) return;
      animate(
        section,
        { transform: [`translateY(${deltaY}px)`, "translateY(0)"] },
        { type: "spring", visualDuration: 0.32, bounce: 0.12 },
      );
    });
  }

  function priorityBoundaryAt(clientY) {
    const headers = priorityHeaders();
    const index = headers.findIndex((header) => clientY < header.getBoundingClientRect().top + header.offsetHeight / 2);
    return index === -1 ? headers.length : index;
  }

  function showPriorityBoundary(index) {
    const headers = priorityHeaders();
    headers.forEach((header) => header.classList.remove("priority-drag-over-top", "priority-drag-over-bottom"));
    if (index < headers.length) headers[index].classList.add("priority-drag-over-top");
    else headers.at(-1)?.classList.add("priority-drag-over-bottom");
  }

  function showPriorityFeedback(movedLabel, relation, targetLabel) {
    ui.showToast({
      title: "Planning priority updated",
      message: `${movedLabel} moved ${relation} ${targetLabel}.`,
      tone: "success",
    });
  }

  document.addEventListener("dragstart", (event) => {
    const grip = event.target.closest(".ls-priority-grip[data-drag-area]");
    if (!grip) return;
    areaDragKey = grip.dataset.dragArea;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", areaDragKey);
    requestAnimationFrame(() => grip.closest(".ls-header")?.classList.add("priority-dragging"));
  });

  document.addEventListener("dragover", (event) => {
    if (!areaDragKey) return;
    if (!event.target.closest("#lists")) return;
    event.preventDefault();
    areaDropIndex = priorityBoundaryAt(event.clientY);
    showPriorityBoundary(areaDropIndex);
  });

  document.addEventListener("drop", async (event) => {
    if (!areaDragKey) return;
    if (!event.target.closest("#lists")) return;
    event.preventDefault();
    const headers = priorityHeaders();
    const labelsByKey = new Map(headers.map((header) => [header.dataset.priorityArea, header.querySelector(".ls-label")?.textContent || header.dataset.priorityArea]));
    const orderedAreaKeys = headers.map((header) => header.dataset.priorityArea);
    const originalOrder = [...orderedAreaKeys];
    const from = orderedAreaKeys.indexOf(areaDragKey);
    if (from !== -1) {
      const movedLabel = labelsByKey.get(areaDragKey) || areaDragKey;
      let to = areaDropIndex ?? priorityBoundaryAt(event.clientY);
      orderedAreaKeys.splice(from, 1);
      if (from < to) to -= 1;
      to = Math.max(0, Math.min(to, orderedAreaKeys.length));
      orderedAreaKeys.splice(to, 0, areaDragKey);
      const movedKey = areaDragKey;
      areaDragKey = null;
      areaDropIndex = null;
      if (orderedAreaKeys.some((key, index) => key !== originalOrder[index])) {
        const movedUp = to < from;
        const targetKey = orderedAreaKeys[movedUp ? to + 1 : to - 1];
        const previousPositions = prioritySectionPositions();
        await dispatchAction("reorderLifeAreas", { orderedAreaKeys });
        animatePriorityReorder(previousPositions);
        showPriorityFeedback(movedLabel, movedUp ? "above" : "below", labelsByKey.get(targetKey) || targetKey);
      }
      document.querySelector(`.ls-header[data-priority-area="${movedKey}"]`)?.classList.remove("priority-dragging");
    } else {
      areaDragKey = null;
      areaDropIndex = null;
    }
    document.querySelectorAll(".ls-header.priority-drag-over-top,.ls-header.priority-drag-over-bottom").forEach((item) => item.classList.remove("priority-drag-over-top", "priority-drag-over-bottom"));
  });

  document.addEventListener("dragstart", (event) => {
    const row = event.target.closest(".list-item[data-drag-list-id]");
    if (!row) return;
    listDragId = row.dataset.dragListId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", listDragId);
    requestAnimationFrame(() => row.classList.add("dragging"));
  });

  document.addEventListener("dragover", (event) => {
    if (!listDragId) return;
    const row = event.target.closest(".list-item[data-drag-list-id]");
    if (!row) return;
    event.preventDefault();
    const before = event.clientY - row.getBoundingClientRect().top < row.offsetHeight / 2;
    document.querySelectorAll(".list-item.drag-over-top,.list-item.drag-over-bottom").forEach((other) => {
      if (other !== row) other.classList.remove("drag-over-top", "drag-over-bottom");
    });
    // Hovering a row is a reorder, not a re-file — drop any section-header
    // highlight left over from hovering a header a moment ago.
    document.querySelectorAll(".ls-header.drop-zone-over").forEach((el) => el.classList.remove("drop-zone-over"));
    row.classList.toggle("drag-over-top", before);
    row.classList.toggle("drag-over-bottom", !before);
  });

  document.addEventListener("drop", async (event) => {
    const row = event.target.closest(".list-item[data-drag-list-id]");
    if (!row || !listDragId) return;
    event.preventDefault();
    const before = event.clientY - row.getBoundingClientRect().top < row.offsetHeight / 2;
    row.classList.remove("drag-over-top", "drag-over-bottom");
    const targetId = row.dataset.dragListId;
    if (targetId !== listDragId) {
      const ids = Array.from(document.querySelectorAll("#lists .list-item[data-drag-list-id]")).map((r) => r.dataset.dragListId);
      const from = ids.indexOf(listDragId);
      if (from !== -1) {
        ids.splice(from, 1);
        let to = ids.indexOf(targetId);
        if (to === -1) to = ids.length;
        else if (!before) to += 1;
        ids.splice(to, 0, listDragId);
        await dispatchAction("reorderLists", { orderedIds: ids });
      }
    }
    listDragId = null;
  });

  // Drop a dragged list onto a life-area section header to re-file it into
  // that area (or into "Unsorted", whose header carries an empty data-area-
  // drop). Mirrors the album drop-zone pattern used for tasks above; the
  // reorder handler above ignores header drops (its .list-item lookup returns
  // null), so the two gestures never fight over one drop.
  document.addEventListener("dragover", (event) => {
    if (!listDragId) return;
    const header = event.target.closest(".ls-header[data-area-drop]");
    if (!header) return;
    event.preventDefault();
    document.querySelectorAll(".ls-header.drop-zone-over").forEach((el) => { if (el !== header) el.classList.remove("drop-zone-over"); });
    document.querySelectorAll(".list-item.drag-over-top,.list-item.drag-over-bottom").forEach((el) => el.classList.remove("drag-over-top", "drag-over-bottom"));
    header.classList.add("drop-zone-over");
  });

  document.addEventListener("drop", async (event) => {
    if (!listDragId) return;
    const header = event.target.closest(".ls-header[data-area-drop]");
    if (!header) return;
    event.preventDefault();
    header.classList.remove("drop-zone-over");
    const area = header.getAttribute("data-area-drop") || null;
    const moved = listDragId;
    listDragId = null;
    await dispatchAction("setListArea", { id: moved, area });
  });

  document.addEventListener("dragend", () => {
    document.querySelectorAll(".list-item.dragging").forEach((row) => row.classList.remove("dragging"));
    document.querySelectorAll(".list-item.drag-over-top,.list-item.drag-over-bottom").forEach((row) => row.classList.remove("drag-over-top", "drag-over-bottom"));
    document.querySelectorAll(".ls-header.drop-zone-over").forEach((el) => el.classList.remove("drop-zone-over"));
    document.querySelectorAll(".ls-header.priority-dragging,.ls-header.priority-drag-over-top,.ls-header.priority-drag-over-bottom").forEach((el) => el.classList.remove("priority-dragging", "priority-drag-over-top", "priority-drag-over-bottom"));
    listDragId = null;
    areaDragKey = null;
    areaDropIndex = null;
  });

  // Topbar search — a plain "input" listener rather than routing through
  // dispatchAction, since it needs to fire on every keystroke and write
  // straight to #searchResults (see performSearch) instead of going through
  // a full state->render() cycle, which would recreate the <input> itself
  // and fight the browser over cursor position mid-type.
  document.getElementById("topbarSearch")?.addEventListener("input", (event) => {
    renderer.performSearch(event.target.value);
  });

  // The grey pill is the field, not just the text sitting inside it —
  // clicking its padding or the magnifier icon should focus the input the
  // same as clicking the text itself, rather than only the thin strip the
  // <input> literally occupies. Skips clicks already inside the results
  // dropdown so picking a result isn't fought over with a refocus.
  document.getElementById("topbarSearchWrap")?.addEventListener("mousedown", (event) => {
    const input = document.getElementById("topbarSearch");
    if (!input || event.target === input || event.target.closest("#searchResults")) return;
    event.preventDefault();
    input.focus();
  });

  // Clicking anywhere outside the search box closes the results dropdown
  // without clearing what was typed — same "click away to dismiss" as the
  // row menu popover above.
  document.addEventListener("click", (event) => {
    const wrap = document.getElementById("topbarSearchWrap");
    if (wrap && !wrap.contains(event.target)) {
      document.getElementById("searchResults")?.classList.remove("show");
    }
  });

  window.addEventListener("resize", renderer.closeRowMenu);

  // ── Keyboard driving ──────────────────────────────────────────────────
  // Tab cycles a "focused region" through the visible panels — sidebar →
  // main → player bar — and Shift+Tab reverses.
  // The focused region gets an outline; inside the sidebar or main, j/k move a
  // row highlight and Enter opens the list / plays the task. h and l are left
  // unbound for now, reserved for vim-style left/right later.
  const REGION_ORDER = ["sidebar", "main", "player"];
  let kbRegion = null;
  let kbIdx = -1;
  const kbHasFocus = () => kbRegion !== null;

  // Regions currently on screen, in cycle order.
  function kbRegions() {
    const elFor = {
      sidebar: document.querySelector(".side"),
      main: document.getElementById("main"),
      player: document.querySelector(".player"),
    };
    return REGION_ORDER.map((key) => ({ key, el: elFor[key] })).filter((r) => r.el);
  }
  // Focusable rows inside a region — lists in the sidebar, task rows in main.
  // The player has no row-level navigation yet (highlight only).
  function kbRows(region) {
    if (region === "sidebar") return Array.from(document.querySelectorAll("#lists .list-item[data-drag-list-id]"));
    if (region === "main") return Array.from(document.querySelectorAll("#main tr[data-drag-id]"));
    return [];
  }
  function kbClearHighlights() {
    document.querySelectorAll(".region-focus").forEach((el) => el.classList.remove("region-focus"));
    document.querySelectorAll(".kb-focus").forEach((el) => el.classList.remove("kb-focus"));
  }
  function kbClear() {
    kbClearHighlights();
    kbRegion = null;
    kbIdx = -1;
  }
  // Highlight a row within the current region. In the sidebar, a target inside
  // a collapsed section expands it first, then re-finds the row in fresh DOM.
  function kbFocusRow(idx) {
    const rows = kbRows(kbRegion);
    if (!rows.length) { kbIdx = -1; return; }
    const clamped = Math.max(0, Math.min(rows.length - 1, idx));
    let el = rows[clamped];
    if (kbRegion === "sidebar") {
      const collapsed = el.closest(".list-section.collapsed");
      if (collapsed) {
        const key = collapsed.querySelector(".ls-header")?.dataset.area;
        const id = el.dataset.dragListId;
        renderer.expandAreaSection(key);
        el = document.querySelector(`#lists .list-item[data-drag-list-id="${id}"]`) || el;
      }
    }
    document.querySelectorAll(".kb-focus").forEach((e) => e.classList.remove("kb-focus"));
    kbIdx = clamped;
    el.classList.add("kb-focus");
    el.scrollIntoView({ block: "nearest" });
  }
  // Move focus to a region by key: outline it only. No row is pre-selected —
  // a task/list gets highlighted only once the user presses j/k, so opening
  // or Tabbing into a region never lights up a "default" row unprompted.
  function kbSetRegion(key) {
    kbClearHighlights();
    kbRegion = key;
    kbIdx = -1;
    const region = kbRegions().find((r) => r.key === key);
    if (region) region.el.classList.add("region-focus");
  }
  function kbCycle(dir) {
    const regions = kbRegions();
    if (!regions.length) return;
    const at = regions.findIndex((r) => r.key === kbRegion);
    const next = at === -1 ? (dir > 0 ? 0 : regions.length - 1) : (at + dir + regions.length) % regions.length;
    kbSetRegion(regions[next].key);
  }
  function kbMove(delta) {
    if (kbRegion !== "sidebar" && kbRegion !== "main") return;
    // First j/k in a region lands on the first row; after that, it moves.
    kbFocusRow(kbIdx === -1 ? 0 : kbIdx + delta);
  }
  function kbActivate() {
    const el = kbRows(kbRegion)[kbIdx];
    if (!el) return;
    if (kbRegion === "sidebar") dispatchAction("selectList", { id: el.dataset.dragListId });
    else if (kbRegion === "main") dispatchAction("play", { id: el.dataset.dragId });
  }
  // Space = play/pause the "current" task, media-player style: the active one
  // if a session is running, else the focused task, else the last one played.
  function kbPlayPause() {
    const run = appState.state.S?.run;
    if (run?.activeTaskId && run.phase) return dispatchAction("play", { id: run.activeTaskId });
    if (kbRegion === "main") {
      const el = kbRows("main")[kbIdx];
      if (el) return dispatchAction("play", { id: el.dataset.dragId });
    }
    const lastId = run?.lastTaskId || appState.state.lastTaskId;
    if (lastId) dispatchAction("play", { id: lastId });
  }
  // True when single-key shortcuts must NOT fire: when the feature is toggled
  // off (Settings > Keyboard), while typing in a field, while a dialog/overlay
  // is open, or when a modifier is held (so browser/OS combos and the ⌘[ ⌘]
  // history keys below pass through untouched).
  function kbSuppressed(event) {
    if (!appState.state.keybindings) return true;
    if (event.metaKey || event.ctrlKey || event.altKey) return true;
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return true;
    if (document.getElementById("doverlay")?.classList.contains("show")) return true;
    if (document.querySelector(".overlay.show")) return true;
    return false;
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (document.activeElement?.id === "topbarSearch") {
        renderer.clearSearch();
        document.getElementById("topbarSearch")?.blur();
        return;
      }
      if (appState.state.lyricsId && !document.getElementById("doverlay").classList.contains("show")) {
        renderer.closeLyrics();
        return;
      }
      if (kbHasFocus()) { kbClear(); return; }
    }

    if (event.metaKey && (event.key === "[" || event.key === "]")) {
      if (document.querySelector(".overlay.show")) return;
      event.preventDefault();
      event.key === "[" ? renderer.goBack() : renderer.goForward();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && ["+", "=", "-", "_", "0"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "0") setZoom(1);
      else if (event.key === "+" || event.key === "=") setZoom(zoomLevel + ZOOM_STEP);
      else setZoom(zoomLevel - ZOOM_STEP);
      return;
    }

    if (kbSuppressed(event)) return;

    if (event.key === "Tab") {
      event.preventDefault();
      kbCycle(event.shiftKey ? -1 : 1);
      return;
    }

    switch (event.key) {
      case "i": event.preventDefault(); kbClear(); return dispatchAction("openInsightsPage");
      case "s": event.preventDefault(); kbClear(); return dispatchAction("openSettingsPage");
      case "j": event.preventDefault(); return kbMove(1);
      case "k": event.preventDefault(); return kbMove(-1);
      case "n": {
        // Context-sensitive "new", by focused region: a list in the sidebar, a
        // task on a list page, or a session for the current track in player.
        event.preventDefault();
        if (kbRegion === "sidebar") return commands.addList();
        if (kbRegion === "main" && appState.state.view === "tasks") return commands.addTask();
        if (kbRegion === "player") {
          const run = appState.state.S?.run;
          const taskId = run?.activeTaskId || run?.lastTaskId;
          if (taskId) commands.addSession(taskId);
        }
        return;
      }
      case "Enter": if (kbRegion === "sidebar" || kbRegion === "main") { event.preventDefault(); kbActivate(); } return;
      case " ": event.preventDefault(); return kbPlayPause();
      case "/": {
        event.preventDefault();
        const search = document.getElementById("topbarSearch");
        if (search) { search.focus(); search.select?.(); }
        return;
      }
      case "?": event.preventDefault(); return commands.showShortcuts();
      default: return;
    }
  });

  return { appState, renderer, commands };
}
