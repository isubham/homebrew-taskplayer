import { createContext, useContext, useEffect, useRef, useCallback } from "react";
import { useCore } from "./CoreProvider.jsx";
import { useUI } from "./UIProvider.jsx";
import { SESSION_PLAYBACK_COPY, TIMER_PLAY_TRIGGERS } from "../constants.jsx";

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

    if (!isForeignSession) {
      if (musicPhase === "work" && lastMusicPhaseRef.current === "work" && musicTaskId !== lastMusicTaskIdRef.current) {
        window.Music.next();
      } else if (musicPhase !== lastMusicPhaseRef.current) {
        window.Music.setActive(musicPhase === "work");
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
        const task = findTask(id);
        const confirmed = await uiConfirm(
          SESSION_PLAYBACK_COPY.switchTitle,
          SESSION_PLAYBACK_COPY.switchDescription(task?.name || SESSION_PLAYBACK_COPY.fallbackTaskName),
          SESSION_PLAYBACK_COPY.switchConfirm,
          false,
        );
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
