import { useEffect, useRef } from "react";
import { MEDIA_SESSION_ACTIONS, MUSIC_APP_NAME } from "../constants.jsx";

type MediaSessionTrack = {
  title: string | null;
  artist: string | null;
  artworkUrls: string[];
};

type MediaSessionControls = {
  play: () => void | Promise<void>;
  pause: () => void;
  next: () => void | Promise<void>;
  previous: () => void | Promise<void>;
};

export function useMediaSession(
  track: MediaSessionTrack | null,
  playing: boolean,
  controls: MediaSessionControls,
) {
  const controlsRef = useRef(controls);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      [MEDIA_SESSION_ACTIONS.play, () => controlsRef.current.play()],
      [MEDIA_SESSION_ACTIONS.pause, () => controlsRef.current.pause()],
      [MEDIA_SESSION_ACTIONS.next, () => controlsRef.current.next()],
      [MEDIA_SESSION_ACTIONS.previous, () => controlsRef.current.previous()],
    ];
    const registeredActions: MediaSessionAction[] = [];

    handlers.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
        registeredActions.push(action);
      } catch {
        // WebKit versions may expose Media Session without every action.
      }
    });

    return () => {
      registeredActions.forEach((action) => {
        navigator.mediaSession.setActionHandler(action, null);
      });
    };
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = track?.title
      ? new MediaMetadata({
          title: track.title,
          artist: track.artist || MUSIC_APP_NAME,
          album: MUSIC_APP_NAME,
          artwork: track.artworkUrls.map((src) => ({ src })),
        })
      : null;
  }, [track?.title, track?.artist, track?.artworkUrls]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);
}
