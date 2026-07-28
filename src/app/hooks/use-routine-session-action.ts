import { useCallback } from "react";
import { SESSION_COPY } from "../constants";
import { routineSessionDraft } from "../routine-session";
import { parseSessionDraft } from "../session-time";
import { esc } from "../utils";
import { useCore } from "../context/CoreProvider";
import { useUI } from "../context/UIProvider";

const { invoke } = window.__TAURI__.core;

export function useRoutineSessionAction() {
  const { apply, helpers: { findTask } } = useCore();
  const {
    actions: { setDialogSession, showToast, uiForm, uiNote },
  } = useUI();

  return useCallback((taskId) => {
    const task = findTask(taskId);
    const draft = routineSessionDraft(task);
    if (!task || !draft) return Promise.resolve();
    setDialogSession(draft);
    return new Promise((resolve) => {
      uiForm({
        type: "session",
        title: SESSION_COPY.routineTitle,
        confirmText: SESSION_COPY.routineButton,
        subtitle: SESSION_COPY.routineSubtitle,
        resolve: async (value) => {
          const range = parseSessionDraft(value);
          if (range) {
            try {
              apply(await invoke("add_session", { taskId, ...range }));
              showToast({ message: SESSION_COPY.routineLoggedToast });
            } catch (error) {
              await uiNote(SESSION_COPY.commandErrorTitle, esc(String(error)));
            }
          }
          resolve();
        },
      });
    });
  }, [apply, findTask, setDialogSession, showToast, uiForm, uiNote]);
}
