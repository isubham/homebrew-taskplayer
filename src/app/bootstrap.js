import { createAppState } from "./state.js";
import { createUi } from "./ui.js";
import { createRenderer } from "./render.js";
import { createCommands } from "./commands.js";

export function bootstrapApp() {
  const appState = createAppState();
  const ui = createUi();
  const renderer = createRenderer({ state: appState.state, helpers: appState, actions: null });
  const commands = createCommands({ state: appState.state, ui, renderer, invoke: window.__TAURI__.core.invoke });

  const dispatchAction = async (action, payload = {}) => {
    const { event, element, id, value, key, overlay, view, listId, mode } = payload;
    switch (action) {
      case "addList": return commands.addList();
      case "editList": return commands.editList(id);
      case "deleteList": return commands.deleteList(id);
      case "selectList": return commands.selectList(id);
      case "addTask": return commands.addTask();
      case "renameTask": return commands.renameTask(id);
      case "setDepth": return commands.setDepth(id, payload.depth ?? value);
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
      case "setListArea": return commands.setListArea(id, payload.area);
      case "toggleAreaSection": return renderer.toggleAreaSection(payload.area);
      case "toggleLifeAgainst": return renderer.toggleLifeAgainst();
      case "selectAgainstArea": return renderer.selectAgainstArea(payload.key);
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
      case "toggleRail": return renderer.toggleRail();
      case "navigate": return renderer.navigate({ view: view || "tasks", listId: listId || null });
      case "goBack": return renderer.goBack();
      case "goForward": return renderer.goForward();
      case "goHome": return renderer.goHome();
      case "searchGoList": return renderer.searchGoList(id);
      case "searchGoTask": return renderer.searchGoTask(id);
      case "openSettingsPage": return renderer.openSettingsPage();
      case "openInsightsPage": return renderer.openInsightsPage();
      case "toggleCompleted": return renderer.toggleCompleted();
      case "playFirst": return renderer.playFirst();
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
    const payload = { ...trigger.dataset, event, element: trigger, id: trigger.dataset.id ?? null, value: event.target.value, key: trigger.dataset.key ?? null, overlay: trigger.dataset.overlay ?? null, view: trigger.dataset.view ?? null, listId: trigger.dataset.listId ?? null, action: trigger.dataset.actionName ?? null, depth: trigger.dataset.depth ?? null, mode: trigger.dataset.mode ?? null };
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
    listDragId = null;
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.activeElement?.id === "topbarSearch") {
      renderer.clearSearch();
      document.getElementById("topbarSearch")?.blur();
      return;
    }
    if (event.key === "Escape" && appState.state.lyricsId && !document.getElementById("doverlay").classList.contains("show")) {
      renderer.closeLyrics();
      return;
    }
    if (!event.metaKey || (event.key !== "[" && event.key !== "]")) return;
    if (document.querySelector(".overlay.show")) return;
    event.preventDefault();
    event.key === "[" ? renderer.goBack() : renderer.goForward();
  });

  return { appState, renderer, commands };
}
