import { useEffect, useRef } from "react";
import { useMusic } from "../../music.jsx";
import {
  TAURI_EVENT_MUSIC_NEXT,
  TAURI_EVENT_MUSIC_TOGGLE,
  TAURI_EVENT_STATE_CHANGED,
} from "../constants.jsx";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

export function useTauriSubscriptions(apply, checkForUpdates) {
  const { musicState, next, pause, play } = useMusic();
  const checkForUpdatesRef = useRef(checkForUpdates);
  const musicControlsRef = useRef({ next, pause, play, playing: musicState.playing });

  useEffect(() => {
    checkForUpdatesRef.current = checkForUpdates;
  }, [checkForUpdates]);

  useEffect(() => {
    musicControlsRef.current = { next, pause, play, playing: musicState.playing };
  }, [musicState.playing, next, pause, play]);

  useEffect(() => {
    let active = true;
    const cleanupFns = [];

    async function init() {
      try {
        const unlistenStateChanged = await listen(TAURI_EVENT_STATE_CHANGED, (event) => {
          if (active) apply(event.payload);
        });
        const unlistenMusicToggle = await listen(TAURI_EVENT_MUSIC_TOGGLE, () => {
          if (!active) return;
          const music = musicControlsRef.current;
          if (music.playing) music.pause();
          else music.play();
        });
        const unlistenMusicNext = await listen(TAURI_EVENT_MUSIC_NEXT, () => {
          if (!active) return;
          musicControlsRef.current.next();
        });

        if (!active) {
          [unlistenStateChanged, unlistenMusicToggle, unlistenMusicNext].forEach((unlisten) => {
            Promise.resolve(unlisten()).catch(() => {});
          });
          return;
        } else {
          cleanupFns.push(unlistenStateChanged, unlistenMusicToggle, unlistenMusicNext);
        }

        const snapshot = await invoke("get_snapshot");
        if (active) apply(snapshot);
      } catch (err) {
        console.error("Failed to setup Tauri subscriptions:", err);
      }
    }

    init();

    // Silent update check
    const updateTimeout = setTimeout(() => {
      if (active) checkForUpdatesRef.current({ silent: true });
    }, 4000);

    return () => {
      active = false;
      clearTimeout(updateTimeout);
      cleanupFns.forEach((fn) => {
        Promise.resolve(fn()).catch((e) => {
          console.warn("Error running cleanup function:", e);
        });
      });
    };
  }, [apply]);
}
