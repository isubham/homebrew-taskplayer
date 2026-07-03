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
      case "renameList": return commands.renameList(id);
      case "deleteList": return commands.deleteList(id);
      case "selectList": return commands.selectList(id);
      case "addTask": return commands.addTask();
      case "renameTask": return commands.renameTask(id);
      case "setDepth": return commands.setDepth(id, payload.depth ?? value);
      case "deleteTask": return commands.deleteTask(id);
      case "setEstimate": return commands.setEstimate(id);
      case "toggleDone": return commands.toggleDone(id);
      case "moveTask": return commands.moveTask(id);
      case "editLyrics": return commands.editLyrics(id);
      case "addSession": return commands.addSession(id);
      case "deleteSession": return commands.deleteSession(id);
      case "exportData": return commands.exportData();
      case "importData": return commands.importData();
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
      case "toggleCompleted": return renderer.toggleCompleted();
      case "playFirst": return renderer.playFirst();
      case "openRowMenu": return renderer.openRowMenu(event, id);
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
