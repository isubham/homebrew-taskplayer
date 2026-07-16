import React, { createContext, useContext, useCallback } from "react";
import { useCore } from "./CoreProvider.jsx";
import { useRoute } from "./RouteProvider.jsx";
import { useUI } from "./UIProvider.jsx";
import { esc } from "../utils.jsx";
import { 
  TOAST_LIST_DELETED, 
  TOAST_TASK_CREATED, 
  TOAST_TASK_RENAMED, 
  TOAST_TASK_DELETED
} from "../constants.jsx";

const { invoke } = window.__TAURI__.core;

const DatabaseContext = createContext(null);

export function useDatabase() {
  return useContext(DatabaseContext);
}

export function DatabaseProvider({ children }) {
  const { S, apply, helpers: { list, findTask } } = useCore();
  const { actions: { navigate } } = useRoute();
  const { 
    actions: { 
      uiConfirm, uiNote, uiPrompt, uiForm, showToast, 
      setOpenTaskId, setOpenListArea, setOpenListId,
      setDialogSession, setCheckingForUpdate, setUpdateInfo, setInstallingUpdate
    } 
  } = useUI();

  const addList = useCallback((area = null) => {
    setOpenListArea(area);
    setOpenListId("new");
  }, [setOpenListArea, setOpenListId]);

  const editList = useCallback((id) => {
    setOpenListId(id);
  }, [setOpenListId]);

  const deleteList = useCallback(async (id) => {
    const listItem = list(id);
    if (!listItem) return;
    const ok = await uiConfirm(
      `Delete list "${listItem.name}"?`,
      "This deletes the list and all of its tasks permanently. It cannot be undone.",
      "Delete"
    );
    if (!ok) return;
    try {
      const snap = await invoke("delete_list", { id });
      apply(snap);
      navigate({ view: "home" });
      showToast({ message: TOAST_LIST_DELETED, tone: "danger" });
    } catch (err) {
      await uiNote("Couldn't delete list", esc(String(err)));
    }
  }, [list, uiConfirm, uiNote, apply, navigate, showToast]);

  const addTask = useCallback(async () => {
    if (!S) return;
    setOpenTaskId("new");
  }, [S, setOpenTaskId]);

  const createTaskFromDetail = useCallback(async (value) => {
    if (!S) return;
    const { listId, name, description, depth, cadence, deadlineAt, minSessionMin, maxSessionMin, impactTier, impactSign, estimateMin, dailyWindows } = value;
    if (!name || !listId) return;

    try {
      let snap = await invoke("add_task", { listId, name, estimateMin });
      const created = snap.tasks.find((t) => t.listId === listId && !t.completedAt && t.name === name);
      if (created) {
        if (description) snap = await invoke("set_description", { id: created.id, text: description });
        if (depth) snap = await invoke("set_depth", { id: created.id, depth });
        if (cadence) snap = await invoke("set_cadence", { id: created.id, cadence });
        if (deadlineAt && cadence !== "daily") snap = await invoke("set_deadline", { id: created.id, deadlineAt });
        if (cadence === "daily" && dailyWindows && dailyWindows.length) {
          snap = await invoke("set_daily_windows", { id: created.id, windows: dailyWindows });
        }
        snap = await invoke("set_session_range", { id: created.id, minMinutes: minSessionMin || 5, maxMinutes: maxSessionMin || 120 });
        if (impactTier) snap = await invoke("set_task_impact", { id: created.id, tier: impactTier, sign: impactSign });
      }
      apply(snap);
      setOpenTaskId(null);
      showToast({ message: TOAST_TASK_CREATED });
    } catch (err) {
      await uiNote("Couldn't create task", String(err));
    }
  }, [S, apply, setOpenTaskId, showToast, uiNote]);

  const renameTask = useCallback(async (id) => {
    const task = findTask(id);
    if (!task) return;
    const name = await uiPrompt("Rename task", task.name);
    if (name) {
      try {
        const snap = await invoke("rename_task", { id, name });
        apply(snap);
        showToast({ message: TOAST_TASK_RENAMED });
      } catch (err) {
        await uiNote("Couldn't rename task", String(err));
      }
    }
  }, [findTask, uiPrompt, apply, uiNote, showToast]);

  const setDepth = useCallback(async (id, depth) => {
    apply(await invoke("set_depth", { id, depth: depth || null }));
  }, [apply]);

  const setCadence = useCallback(async (id, cadence) => {
    apply(await invoke("set_cadence", { id, cadence: cadence || null }));
  }, [apply]);

  const addDailyScheduleRow = useCallback(async (id) => {
    const task = findTask(id);
    if (!task) return;
    const windows = [...(task.dailyWindows || [])];
    windows.push({ weekday: 1, startMinute: 540, endMinute: 1020 });
    apply(await invoke("set_daily_windows", { id, windows }));
  }, [findTask, apply]);

  const removeDailyScheduleRow = useCallback(async (id, index) => {
    const task = findTask(id);
    if (!task) return;
    const windows = [...(task.dailyWindows || [])];
    windows.splice(index, 1);
    apply(await invoke("set_daily_windows", { id, windows }));
  }, [findTask, apply]);

  const setDailySchedule = useCallback(async (id, windows) => {
    apply(await invoke("set_daily_windows", { id, windows }));
  }, [apply]);

  const setSessionRangeField = useCallback(async (id, rangeField, value) => {
    const task = findTask(id);
    if (!task) return;
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    const minMinutes = rangeField === "min" ? parsed : task.minSessionMin || 5;
    const maxMinutes = rangeField === "max" ? parsed : task.maxSessionMin || 120;
    apply(await invoke("set_session_range", { id, minMinutes, maxMinutes }));
  }, [findTask, apply]);

  const deleteTask = useCallback(async (id) => {
    const task = findTask(id);
    if (!task) return;
    const ok = await uiConfirm(
      `Delete task "${task.name}"?`,
      "This deletes the task and all of its recorded sessions permanently. It cannot be undone.",
      "Delete"
    );
    if (!ok) return;
    apply(await invoke("delete_task", { id }));
    setOpenTaskId(null);
    showToast({ message: TOAST_TASK_DELETED, tone: "danger" });
  }, [findTask, uiConfirm, apply, setOpenTaskId, showToast]);

  const setEstimateInline = useCallback(async (id, value) => {
    const val = value.trim();
    if (!val) {
      apply(await invoke("set_estimate", { id, minutes: null }));
      return;
    }
    const hours = parseFloat(val);
    if (Number.isFinite(hours) && hours >= 0) {
      apply(await invoke("set_estimate", { id, minutes: Math.round(hours * 60) }));
    }
  }, [apply]);

  const bumpEstimate = useCallback(async (id) => {
    const task = findTask(id);
    if (!task) return;
    const currentHours = (task.estimateMin || 0) / 60;
    apply(await invoke("set_estimate", { id, minutes: Math.round((currentHours + 1) * 60) }));
  }, [findTask, apply]);

  const decreaseEstimate = useCallback(async (id) => {
    const task = findTask(id);
    if (!task) return;
    const currentHours = (task.estimateMin || 0) / 60;
    const nextHours = Math.max(0, currentHours - 1);
    apply(await invoke("set_estimate", { id, minutes: nextHours > 0 ? Math.round(nextHours * 60) : null }));
  }, [findTask, apply]);

  const setDeadlineInline = useCallback(async (id, value) => {
    if (!value) {
      apply(await invoke("set_deadline", { id, deadlineAt: null }));
    } else {
      const ms = new Date(value).getTime();
      if (Number.isFinite(ms)) {
        apply(await invoke("set_deadline", { id, deadlineAt: ms }));
      }
    }
  }, [apply]);

  const setImpactTier = useCallback(async (id, tier) => {
    const task = findTask(id);
    if (!task) return;
    apply(await invoke("set_task_impact", { id, tier: tier || null, sign: task.impactSign || 1 }));
  }, [findTask, apply]);

  const setImpactSign = useCallback(async (id, sign) => {
    const task = findTask(id);
    if (!task) return;
    apply(await invoke("set_task_impact", { id, tier: task.impactTier || null, sign: parseInt(sign, 10) === -1 ? -1 : 1 }));
  }, [findTask, apply]);

  const toggleDone = useCallback(async (id) => {
    apply(await invoke("set_done", { id }));
  }, [apply]);

  const moveTaskInline = useCallback(async (id, listId) => {
    apply(await invoke("move_task", { id, listId }));
  }, [apply]);

  const reorderTasks = useCallback(async (listId, orderedIds) => {
    apply(await invoke("reorder_tasks", { listId, orderedIds }));
  }, [apply]);

  const reorderLists = useCallback(async (orderedIds) => {
    apply(await invoke("reorder_lists", { orderedIds }));
  }, [apply]);

  const reorderLifeAreas = useCallback(async (orderedAreaKeys) => {
    apply(await invoke("reorder_life_areas", { orderedAreaKeys }));
  }, [apply]);

  const setAlbum = useCallback((id) => {
    const task = findTask(id);
    if (!task) return;
    return new Promise((resolve) => {
      uiForm({
        type: "album",
        title: "Set album name",
        confirmText: "Save",
        resolve: async (val) => {
          if (val !== null) {
            apply(await invoke("set_album", { id, album: val.trim() || null }));
          }
          resolve();
        }
      });
    });
  }, [findTask, uiForm, apply]);

  const moveTaskToAlbum = useCallback(async (id, album) => {
    apply(await invoke("set_album", { id, album: album || null }));
  }, [apply]);

  const editLyrics = useCallback((id) => {
    const task = findTask(id);
    if (!task) return;
    return new Promise((resolve) => {
      uiForm({
        type: "lyrics",
        title: "Edit lyrics / notes",
        confirmText: "Save",
        resolve: async (val) => {
          if (val !== null) {
            apply(await invoke("set_description", { id, text: val.trim() || null }));
          }
          resolve();
        }
      });
    });
  }, [findTask, uiForm, apply]);

  const setLyricsInline = useCallback(async (id, value) => {
    apply(await invoke("set_description", { id, text: (value ?? "").trim() || null }));
  }, [apply]);

  const addSession = useCallback((taskId) => {
    const d = new Date();
    const dateStr = d.toLocaleDateString("en-CA"); // YYYY-MM-DD
    const startStr = d.toTimeString().slice(0, 5); // HH:MM
    setDialogSession({ date: dateStr, start: startStr, end: startStr });
    return new Promise((resolve) => {
      uiForm({
        type: "session",
        title: "Add session",
        confirmText: "Add",
        resolve: async (val) => {
          if (val) {
            const start = new Date(`${val.date}T${val.start}`).getTime();
            const end = new Date(`${val.date}T${val.end}`).getTime();
            apply(await invoke("add_session", { taskId, start, end }));
          }
          resolve();
        }
      });
    });
  }, [uiForm, setDialogSession, apply]);

  const editSession = useCallback((id) => {
    const session = S?.sessions.find((s) => s.id === id);
    if (session) {
      const d = new Date(session.start);
      const dateStr = d.toLocaleDateString("en-CA"); // YYYY-MM-DD
      const startStr = d.toTimeString().slice(0, 5); // HH:MM
      const endStr = session.end ? new Date(session.end).toTimeString().slice(0, 5) : "";
      setDialogSession({ date: dateStr, start: startStr, end: endStr });
    }
    return new Promise((resolve) => {
      uiForm({
        type: "session",
        title: "Edit session",
        confirmText: "Save",
        subtitle: "Editing or deleting this session will recalculate all rollups immediately.",
        resolve: async (val) => {
          if (val) {
            const start = new Date(`${val.date}T${val.start}`).getTime();
            const end = val.end ? new Date(`${val.date}T${val.end}`).getTime() : null;
            apply(await invoke("update_session", { id, start, end }));
          }
          resolve();
        }
      });
    });
  }, [S, uiForm, setDialogSession, apply]);

  const deleteSession = useCallback(async (id) => {
    const ok = await uiConfirm("Delete session?", "This removes the session duration from the task rollup permanently. It cannot be undone.", "Delete");
    if (!ok) return;
    apply(await invoke("delete_session", { id }));
  }, [uiConfirm, apply]);

  const openTrackLink = useCallback(async (url) => {
    try {
      await invoke("open_url", { url });
    } catch (_) {}
  }, []);

  const openNotificationSettings = useCallback(async () => {
    try {
      await invoke("open_url", { url: "x-apple.systempreferences:com.apple.preference.notifications" });
    } catch (err) {
      await uiNote("Couldn't open Notification settings", esc(String(err)));
    }
  }, [uiNote]);

  const exportData = useCallback(async () => {
    try {
      const path = await invoke("export_data");
      await uiNote("Data exported", `Saved a backup and revealed it in Finder:<br><span style="color:#fff;word-break:break-all">${esc(path)}</span>`);
    } catch (err) {
      await uiNote("Export failed", esc(String(err)));
    }
  }, [uiNote]);

  const importData = useCallback(async () => {
    if (!S) return;
    const input = document.getElementById("importFile");
    if (!input) return;
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
        setOpenTaskId(null);
        apply(snap);
        await uiNote("Import complete", `Loaded ${snap.lists.length} list${snap.lists.length === 1 ? "" : "s"} and ${snap.tasks.length} task${snap.tasks.length === 1 ? "" : "s"}.`);
      } catch (err) {
        await uiNote("Import failed", esc(String(err)));
      }
    };
    input.click();
  }, [S, uiConfirm, uiNote, apply, setOpenTaskId]);

  const revealLogs = useCallback(async () => {
    try {
      await invoke("reveal_logs");
    } catch (err) {
      await uiNote("Couldn't open the log file", esc(String(err)));
    }
  }, [uiNote]);

  const signInGoogle = useCallback(async () => {
    try {
      await invoke("sign_in_google");
    } catch (err) {
      await uiNote("Sign-in failed", esc(String(err)));
    }
  }, [uiNote]);

  const signOut = useCallback(async () => {
    apply(await invoke("sign_out"));
  }, [apply]);

  const syncNow = useCallback(async () => {
    try {
      await invoke("sync_now");
    } catch (err) {
      showToast({ message: `Sync failed: ${err}`, tone: "danger" });
    }
  }, [showToast]);

  const fullSync = useCallback(async () => {
    try {
      await invoke("full_sync");
    } catch (err) {
      showToast({ message: `Sync failed: ${err}`, tone: "danger" });
    }
  }, [showToast]);

  const checkForUpdates = useCallback(async ({ silent = false } = {}) => {
    setCheckingForUpdate(true);
    try {
      const info = await invoke("check_for_update");
      setUpdateInfo(info || null);
      setCheckingForUpdate(false);
      if (info) {
        const notes = (info.notes || "").trim();
        const ok = await new Promise((resolve) => {
          uiForm({
            type: "confirm",
            title: `Update to ${info.version}?`,
            confirmText: "Download & install",
            messageHtml: `<div class="dbody">TaskPlayer will download it and restart.${notes ? `<br><br><span style="color:#fff">${esc(notes)}</span>` : ""}</div>`,
            resolve,
          });
        });
        if (!ok) return;
        setInstallingUpdate(true);
        try {
          await invoke("install_update");
        } catch (err) {
          setInstallingUpdate(false);
          await uiNote("Update failed", esc(String(err)));
        }
      } else if (!silent) {
        await uiNote("You're up to date", `TaskPlayer ${esc(S?.appVersion || "")} is the newest version.`);
      }
    } catch (err) {
      setCheckingForUpdate(false);
      if (!silent) await uiNote("Couldn't check for updates", esc(String(err)));
    }
  }, [S, uiForm, uiNote, setCheckingForUpdate, setUpdateInfo, setInstallingUpdate]);

  const setMode = useCallback(async (mode) => {
    apply(await invoke("set_mode", { mode }));
  }, [apply]);

  const setConfigField = useCallback(async (key, value) => {
    const parsed = parseInt(value, 10);
    apply(await invoke("set_config_field", { key, value: Number.isNaN(parsed) ? 1 : parsed }));
  }, [apply]);

  const setConfigSound = useCallback(async (key, value) => {
    apply(await invoke("set_config_sound", { key, value }));
  }, [apply]);

  const cycleMode = useCallback(() => {
    const order = ["open", "target", "pomodoro"];
    const modeValue = S?.config?.mode;
    const next = modeValue ? order[(order.indexOf(modeValue) + 1) % order.length] : "open";
    setMode(next);
  }, [S, setMode]);

  return (
    <DatabaseContext.Provider value={{
      actions: {
        addList, editList, deleteList, addTask, createTaskFromDetail,
        renameTask, setDepth, setCadence, addDailyScheduleRow, removeDailyScheduleRow,
        setDailySchedule, setSessionRangeField, deleteTask, setEstimateInline,
        bumpEstimate, decreaseEstimate, setDeadlineInline, setImpactTier, setImpactSign,
        toggleDone, moveTaskInline, reorderTasks, reorderLists, reorderLifeAreas,
        setAlbum, moveTaskToAlbum, editLyrics, setLyricsInline, addSession, editSession,
        deleteSession, openTrackLink, openNotificationSettings, exportData, importData,
        revealLogs, signInGoogle, signOut, syncNow, fullSync, checkForUpdates,
        setMode, setConfigField, setConfigSound, cycleMode
      }
    }}>
      {children}
    </DatabaseContext.Provider>
  );
}
