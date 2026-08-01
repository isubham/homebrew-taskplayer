import { createContext, useContext, useEffect, useRef, useCallback } from "react";
import { useCore } from "./CoreProvider.jsx";
import { useUI } from "./UIProvider.jsx";
import { SESSION_PLAYBACK_COPY, TIMER_PLAY_TRIGGERS, SYSTEM_JOURNALING_TASK_ID, SYSTEM_PLANNING_TASK_ID } from "../constants.jsx";

const { invoke } = window.__TAURI__.core;

const PlaybackContext = createContext(null);

export function usePlayback() {
  return useContext(PlaybackContext);
}

export function PlaybackProvider({ children }) {
  const { S, apply, helpers: { findTask } } = useCore();
  const { actions: { uiConfirm, uiNote } } = useUI();

  const lastMusicPhaseRef = useRef(null);
  const lastMusicTaskIdRef = useRef(null);
  const suppressMusicRef = useRef(false);

  // Sync Music Logic (runs reactively on S change)
  useEffect(() => {
    if (!S || !window.Music) return;
    const run = S.run;
    const musicPhase = run.activeTaskId && run.phase ? run.phase : null;
    const musicTaskId = run.activeTaskId || null;
    const isForeignSession = Boolean(
      musicTaskId
      && musicPhase
      && run.deviceId
      && run.deviceId !== S.deviceId,
    );
    
    if (musicTaskId !== lastMusicTaskIdRef.current) {
      if (musicTaskId === SYSTEM_JOURNALING_TASK_ID || musicTaskId === SYSTEM_PLANNING_TASK_ID) {
        suppressMusicRef.current = lastMusicPhaseRef.current !== "work";
      } else {
        suppressMusicRef.current = false;
      }
    }

    if (!isForeignSession) {
      const wantsToPlay = musicPhase === "work" && !suppressMusicRef.current;
      const lastWantsToPlay = lastMusicPhaseRef.current === "work" && !(lastMusicTaskIdRef.current === SYSTEM_JOURNALING_TASK_ID || lastMusicTaskIdRef.current === SYSTEM_PLANNING_TASK_ID ? suppressMusicRef.current : false);
      const isSystemSwitch = (
        musicTaskId === SYSTEM_JOURNALING_TASK_ID || musicTaskId === SYSTEM_PLANNING_TASK_ID ||
        lastMusicTaskIdRef.current === SYSTEM_JOURNALING_TASK_ID || lastMusicTaskIdRef.current === SYSTEM_PLANNING_TASK_ID
      );

      if (wantsToPlay && lastWantsToPlay && musicTaskId !== lastMusicTaskIdRef.current && !isSystemSwitch) {
        window.Music.next();
      } else if (wantsToPlay !== lastWantsToPlay) {
        window.Music.setActive(wantsToPlay);
      }
      lastMusicPhaseRef.current = musicPhase;
      lastMusicTaskIdRef.current = musicTaskId;
    } else {
      window.Music.pause();
      lastMusicPhaseRef.current = null;
      lastMusicTaskIdRef.current = null;
    }
  }, [S]);

  const play = useCallback(async (id, trigger = TIMER_PLAY_TRIGGERS.unknown) => {
    try {
      const run = S?.run;
      const currentTaskId = run?.activeSessionId
        ? run.activeTaskId || run.lastTaskId
        : null;
      if (currentTaskId && currentTaskId !== id) {
        const isSystemSwitch = (
          id === SYSTEM_JOURNALING_TASK_ID || id === SYSTEM_PLANNING_TASK_ID ||
          currentTaskId === SYSTEM_JOURNALING_TASK_ID || currentTaskId === SYSTEM_PLANNING_TASK_ID
        );
        let confirmed = true;
        if (!isSystemSwitch) {
          const task = findTask(id);
          confirmed = await uiConfirm(
            SESSION_PLAYBACK_COPY.switchTitle,
            SESSION_PLAYBACK_COPY.switchDescription(task?.name || SESSION_PLAYBACK_COPY.fallbackTaskName),
            SESSION_PLAYBACK_COPY.switchConfirm,
            false,
          );
        }
        if (!confirmed) return false;
        apply(await invoke("finish_session"));
      }
      apply(await invoke("play", { taskId: id, trigger }));
      return true;
    } catch (error) {
      await uiNote(SESSION_PLAYBACK_COPY.commandErrorTitle, String(error));
      return false;
    }
  }, [S, apply, findTask, uiConfirm, uiNote]);

  const stop = useCallback(async () => {
    apply(await invoke("stop"));
  }, [apply]);

  const finishSession = useCallback(async () => {
    try {
      apply(await invoke("finish_session"));
      return true;
    } catch (error) {
      await uiNote(SESSION_PLAYBACK_COPY.commandErrorTitle, String(error));
      return false;
    }
  }, [apply, uiNote]);

  const skipBreak = useCallback(async () => {
    apply(await invoke("skip_break"));
  }, [apply]);

  const startBreak = useCallback(async () => {
    apply(await invoke("start_break"));
  }, [apply]);

  const resumeWork = useCallback(async () => {
    apply(await invoke("resume_work"));
  }, [apply]);

  return (
    <PlaybackContext.Provider value={{
      actions: { play, pause: stop, stop, finishSession, skipBreak, startBreak, resumeWork }
    }}>
      {children}
    </PlaybackContext.Provider>
  );
}
