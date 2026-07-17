import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useCore } from "./CoreProvider.jsx";
import { useRoute } from "./RouteProvider.jsx";
import { useSettings } from "./SettingsProvider.jsx";
import { useUI } from "./UIProvider.jsx";
import { usePlayback } from "./PlaybackProvider.jsx";
import { useDatabase } from "./DatabaseProvider.jsx";
import { KEYBOARD_SETTINGS_COPY, ZOOM_STEP } from "../constants.jsx";

const KeyboardContext = createContext(null);

export function useKeyboard() {
  return useContext(KeyboardContext);
}

export function KeyboardProvider({ children }) {
  const { S, helpers: { list, findTask } } = useCore();
  const { state: { view, activeListId }, actions: { navigate, goBack, goForward, goHome, selectList } } = useRoute();
  const { state: { keybindings, zoomLevel }, actions: { setSidebarCollapsed, setZoom } } = useSettings();
  const { state: { dialog, lyricsId }, actions: { setLyricsId, uiNote } } = useUI();
  const { actions: { play } } = usePlayback();
  const { actions: { addList, addTask, addSession } } = useDatabase();

  const [kbRegion, setKbRegion] = useState(null);
  const [kbIdx, setKbIdx] = useState(-1);

  // We need to store the last active taskId for playPauseShort
  const lastTaskIdRef = useRef(null);
  useEffect(() => {
    if (S?.run?.activeTaskId) {
      lastTaskIdRef.current = S.run.activeTaskId;
    }
  }, [S]);

  useEffect(() => {
    if (!keybindings) return;

    const REGION_ORDER = ["sidebar", "main", "player"];
    const elFor = {
      sidebar: () => document.querySelector(".side"),
      main: () => document.getElementById("main"),
      player: () => document.querySelector(".player"),
    };

    const getRegions = () => REGION_ORDER.map((key) => ({ key, el: elFor[key]() })).filter((r) => r.el);
    const getRows = (region) => {
      if (region === "sidebar") return Array.from(document.querySelectorAll("#lists .list-item[data-drag-list-id]"));
      if (region === "main") return Array.from(document.querySelectorAll("#main tr[data-drag-id]"));
      return [];
    };

    const clearHighlights = () => {
      document.querySelectorAll(".region-focus").forEach((el) => el.classList.remove("region-focus"));
      document.querySelectorAll(".kb-focus").forEach((el) => el.classList.remove("kb-focus"));
    };

    const clearFocus = () => {
      clearHighlights();
      setKbRegion(null);
      setKbIdx(-1);
    };

    const focusRow = (region, idx) => {
      const rows = getRows(region);
      if (!rows.length) { setKbIdx(-1); return; }
      const clamped = Math.max(0, Math.min(rows.length - 1, idx));
      let el = rows[clamped];

      if (region === "sidebar") {
        const collapsed = el.closest(".list-section.collapsed");
        if (collapsed) {
          const key = collapsed.querySelector(".ls-header")?.dataset.area;
          const id = el.dataset.dragListId;
          setSidebarCollapsed((prev) => {
            const next = { ...prev, [key]: false };
            localStorage.setItem("tp.sidebarCollapsed", JSON.stringify(next));
            return next;
          });
          setTimeout(() => {
            const newEl = document.querySelector(`#lists .list-item[data-drag-list-id="${id}"]`);
            if (newEl) {
              document.querySelectorAll(".kb-focus").forEach((e) => e.classList.remove("kb-focus"));
              newEl.classList.add("kb-focus");
              newEl.scrollIntoView({ block: "nearest" });
            }
          }, 50);
        }
      }

      document.querySelectorAll(".kb-focus").forEach((e) => e.classList.remove("kb-focus"));
      setKbIdx(clamped);
      el.classList.add("kb-focus");
      el.scrollIntoView({ block: "nearest" });
    };

    const setRegion = (key) => {
      clearHighlights();
      setKbRegion(key);
      setKbIdx(-1);
      const r = getRegions().find((reg) => reg.key === key);
      if (r) r.el.classList.add("region-focus");
    };

    const cycleRegion = (dir) => {
      const regs = getRegions();
      if (!regs.length) return;
      const at = regs.findIndex((r) => r.key === kbRegion);
      const next = at === -1 ? (dir > 0 ? 0 : regs.length - 1) : (at + dir + regs.length) % regs.length;
      setRegion(regs[next].key);
    };

    const moveRowFocus = (delta) => {
      if (kbRegion !== "sidebar" && kbRegion !== "main") return;
      focusRow(kbRegion, kbIdx === -1 ? 0 : kbIdx + delta);
    };

    const activateFocus = () => {
      const rows = getRows(kbRegion);
      const el = rows[kbIdx];
      if (!el) return;
      if (kbRegion === "sidebar") {
        selectList(el.dataset.dragListId);
      } else if (kbRegion === "main") {
        play(el.dataset.dragId);
      }
    };

    const playPauseShort = () => {
      const run = S?.run;
      if (run?.activeTaskId && run.phase) return play(run.activeTaskId);
      if (kbRegion === "main") {
        const rows = getRows("main");
        const el = rows[kbIdx];
        if (el) return play(el.dataset.dragId);
      }
      const lastId = run?.lastTaskId || lastTaskIdRef.current;
      if (lastId) play(lastId);
    };

    const isSuppressed = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return true;
      const a = document.activeElement;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return true;
      if (dialog) return true;
      if (document.querySelector(".overlay.show")) return true;
      return false;
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (document.activeElement?.id === "topbarSearch") {
          document.getElementById("topbarSearch")?.blur();
          return;
        }
        if (lyricsId) {
          setLyricsId(null);
          return;
        }
        if (kbRegion !== null) {
          clearFocus();
          return;
        }
      }

      if (event.metaKey && (event.key === "[" || event.key === "]")) {
        if (document.querySelector(".overlay.show")) return;
        event.preventDefault();
        event.key === "[" ? goBack() : goForward();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && ["+", "=", "-", "_", "0"].includes(event.key)) {
        event.preventDefault();
        if (event.key === "0") setZoom(1);
        else if (event.key === "+" || event.key === "=") setZoom(zoomLevel + ZOOM_STEP);
        else setZoom(zoomLevel - ZOOM_STEP);
        return;
      }

      if (isSuppressed(event)) return;

      if (event.key === "Tab") {
        event.preventDefault();
        cycleRegion(event.shiftKey ? -1 : 1);
        return;
      }

      switch (event.key) {
        case "o": event.preventDefault(); clearFocus(); return goHome();
        case "i": event.preventDefault(); clearFocus(); return navigate({ view: "insights" });
        case "s": event.preventDefault(); clearFocus(); return navigate({ view: "settings" });
        case "j": event.preventDefault(); return moveRowFocus(1);
        case "k": event.preventDefault(); return moveRowFocus(-1);
        case "n": {
          event.preventDefault();
          if (kbRegion === "sidebar") return addList();
          if (kbRegion === "main" && view === "tasks") return addTask();
          if (kbRegion === "player") {
            const run = S?.run;
            const taskId = run?.activeTaskId || run?.lastTaskId;
            if (taskId) addSession(taskId);
          }
          return;
        }
        case "Enter": if (kbRegion === "sidebar" || kbRegion === "main") { event.preventDefault(); activateFocus(); } return;
        case " ": event.preventDefault(); return playPauseShort();
        case "/": {
          event.preventDefault();
          const search = document.getElementById("topbarSearch");
          if (search) { search.focus(); search.select?.(); }
          return;
        }
        case "?":
          event.preventDefault();
          return uiNote(
            KEYBOARD_SETTINGS_COPY.shortcutsTitle,
            KEYBOARD_SETTINGS_COPY.shortcutsHtml,
            KEYBOARD_SETTINGS_COPY.shortcutsConfirmLabel,
          );
        default: return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    keybindings, kbRegion, kbIdx, S, lyricsId, dialog, view, zoomLevel, 
    goBack, goForward, goHome, setZoom, navigate, play, addList, addTask, addSession, uiNote,
    setSidebarCollapsed, selectList
  ]);

  return (
    <KeyboardContext.Provider value={{
      state: { kbRegion, kbIdx }
    }}>
      {children}
    </KeyboardContext.Provider>
  );
}
