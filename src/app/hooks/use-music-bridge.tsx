import { useEffect } from "react";
import { commands } from "../bindings";

type MusicBridgeState = {
  playing: boolean;
};

type MusicBridgeControls = {
  setActive: (active: boolean) => void | Promise<void>;
  play: () => void | Promise<void>;
  pause: () => void;
  next: () => void | Promise<void>;
  previous: () => void | Promise<void>;
  setGenre: (genre: string) => void | Promise<void>;
};

export function useMusicBridge(
  musicState: MusicBridgeState,
  controls: MusicBridgeControls,
  genres: Record<string, { label: string }>,
) {
  useEffect(() => {
    commands.setMusicPlaying(musicState.playing).catch(() => {});
  }, [musicState.playing]);

  useEffect(() => {
    const onChange = window.Music?._onChange;
    const onStateChanged = window.Music?._onStateChanged;
    window.Music = {
      GENRES: genres,
      snapshot: () => musicState,
      setOnChange(callback) {
        this._onChange = callback;
        callback(musicState);
      },
      setActive: controls.setActive,
      play: controls.play,
      pause: controls.pause,
      next: controls.next,
      previous: controls.previous,
      setGenre: controls.setGenre,
      state: musicState,
      onStateChanged(callback) {
        this._onStateChanged = callback;
        callback(musicState);
      },
      _onChange: onChange,
      _onStateChanged: onStateChanged,
    };

    onChange?.(musicState);
    onStateChanged?.(musicState);
  }, [musicState, controls, genres]);
}
