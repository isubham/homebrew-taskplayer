import React, { createContext, useContext, useEffect, useRef, useCallback } from "react";
import { useCore } from "./CoreProvider.jsx";
import { TIMER_PLAY_TRIGGERS } from "../constants.jsx";

const { invoke } = window.__TAURI__.core;

const PlaybackContext = createContext(null);

export function usePlayback() {
  return useContext(PlaybackContext);
}

export function PlaybackProvider({ children }) {
  const { S, apply } = useCore();

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
    apply(await invoke("play", { taskId: id, trigger }));
  }, [apply]);

  const stop = useCallback(async () => {
    apply(await invoke("stop"));
  }, [apply]);

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
      actions: { play, stop, skipBreak, startBreak, resumeWork }
    }}>
      {children}
    </PlaybackContext.Provider>
  );
}
