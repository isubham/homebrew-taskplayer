import { useCallback, useEffect, useRef, useState } from "react";
import { TAURI_EVENT_AUDIO_INTERRUPTION } from "../constants";
import { commands } from "../bindings";

type InterruptionKind = "none" | "media" | "meeting";
type InterruptionEvent = { active: boolean; kind: InterruptionKind };

const { listen } = window.__TAURI__.event;

export function useAudioInterruption(musicEnabled: boolean) {
  const [event, setEvent] = useState<InterruptionEvent>({ active: false, kind: "none" });
  const [suppressed, setSuppressed] = useState(false);
  const overrideRef = useRef(false);
  const eventRef = useRef<InterruptionEvent>({ active: false, kind: "none" });
  const musicEnabledRef = useRef(musicEnabled);

  useEffect(() => {
    musicEnabledRef.current = musicEnabled;
  }, [musicEnabled]);

  useEffect(() => {
    let active = true;
    let unlisten: null | (() => void) = null;
    listen<InterruptionEvent>(TAURI_EVENT_AUDIO_INTERRUPTION, ({ payload }) => {
      if (!active) return;
      eventRef.current = payload;
      setEvent(payload);
      if (!payload.active) {
        overrideRef.current = false;
        setSuppressed(false);
      } else if (payload.kind === "media" && musicEnabledRef.current) {
        commands.takeOverMusicPlayers().then((tookOver) => {
          if (!active || eventRef.current.kind !== "media") return;
          if (tookOver) {
            overrideRef.current = true;
            setSuppressed(false);
          } else if (!overrideRef.current) {
            setSuppressed(true);
          }
        }).catch(() => {
          if (active && eventRef.current.kind === "media") setSuppressed(true);
        });
      } else if (!overrideRef.current) {
        setSuppressed(true);
      }
    }).then((cleanup) => {
      if (active) unlisten = cleanup;
      else cleanup();
    }).catch(console.error);
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const overrideCurrent = useCallback(() => {
    if (!event.active) return;
    overrideRef.current = true;
    setSuppressed(false);
  }, [event.active]);

  const takeOverCurrent = useCallback(async () => {
    const tookOver = await commands.takeOverMusicPlayers().catch(() => false);
    if (tookOver) {
      overrideRef.current = true;
      setSuppressed(false);
    }
    return tookOver;
  }, []);

  const releaseTakeover = useCallback(() => {
    commands.releaseMusicPlayers().catch(() => {});
  }, []);

  return {
    active: event.active,
    kind: event.kind,
    suppressed,
    overrideCurrent,
    takeOverCurrent,
    releaseTakeover,
  };
}
