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
      case "setEstimate": return commands.setEstimate(id);
      case "toggleDone": return commands.toggleDone(id);
      case "moveTask": return commands.moveTask(id);
      case "reorderTasks": return commands.reorderTasks(listId, payload.orderedIds);
      case "reorderLists": return commands.reorderLists(payload.orderedIds);
      case "setAlbum": return commands.setAlbum(id);
      case "moveTaskToAlbum": return commands.moveTaskToAlbum(id, value);
      case "editLyrics": return commands.editLyrics(id);
      case "addSession": return commands.addSession(id);
      case "toggleSessionGroup": return renderer.toggleSessionGroup(payload.day, id);
      case "setSessionsPeriod": return renderer.setSessionsPeriod(value);
      case "editSession": return commands.editSession(id);
      case "deleteSession": return commands.deleteSession(id);
      case "exportData": return commands.exportData();
      case "importData": return commands.importData();
      case "signInGoogle": return commands.signInGoogle();
      case "signOut": return commands.signOut();
      case "syncNow": return commands.syncNow();
      case "fullSync": return commands.fullSync();
      case "checkForUpdates": return commands.checkForUpdates();
      case "promptInstallUpdate": return commands.promptInstallUpdate();
      case "play": return commands.play(id);
      case "stop": return commands.stop();
      case "skipBreak": return commands.skipBreak();
      case "setMode": return commands.setMode(value || mode || "open");
      case "setConfigField": return commands.setConfigField(key, value ?? element?.value ?? "");
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
      case "openSettingsPage": return renderer.openSettingsPage();
      case "openSessionsPage": return renderer.openSessionsPage();
      case "openRecentPage": return renderer.openRecentPage();
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
      case "openSettings": return renderer.openSettings();
      case "closeSettings": return renderer.closeSettings();
      case "renderSettings": return renderer.renderSettings();
      case "renderSettingsPage": return renderer.renderSettingsPage();
      case "closeOverlay": {
        if (event?.target !== element) return undefined;
        if (overlay === "detail") return renderer.closeDetail();
        if (overlay === "settings") return renderer.closeSettings();
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

  document.addEventListener("dragend", () => {
    document.querySelectorAll(".list-item.dragging").forEach((row) => row.classList.remove("dragging"));
    document.querySelectorAll(".list-item.drag-over-top,.list-item.drag-over-bottom").forEach((row) => row.classList.remove("drag-over-top", "drag-over-bottom"));
    listDragId = null;
  });

  window.addEventListener("resize", renderer.closeRowMenu);
  document.addEventListener("keydown", (event) => {
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
