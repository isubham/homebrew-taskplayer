import { bootstrapApp } from "./app/bootstrap.js";

(async function init() {
  const { appState, renderer } = bootstrapApp();
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  window.Music?.setOnChange((musicState) => {
    renderer.renderMusic(musicState);
    // Mirror play/pause into Rust purely so the tray's "Play/Pause music"
    // label reads correctly — the audio itself only ever lives here.
    invoke("set_music_playing", { playing: !!musicState.playing }).catch(() => {});
  });

  const snapshot = await invoke("get_snapshot");
  appState.state.setSnapshot(snapshot);
  appState.state.setRoute("tasks", appState.state.activeListId);
  // state.lastPhase/lastTaskId start out null (see state.js), so calling
  // syncMusic() here — instead of just silently pre-seeding those two
  // fields to match the freshly-loaded snapshot — is what makes it notice
  // "phase went from null to work" and actually resume focus music if a
  // task was still mid-session across a reload/app-restart. Previously
  // this only pre-synced the tracking fields without ever telling
  // window.Music to resume, so a reload always silently killed the music
  // even when a work session was still active.
  renderer.syncMusic();
  renderer.render();

  await listen("state-changed", (event) => {
    appState.state.setSnapshot(event.payload);
    renderer.syncMusic();
    renderer.render();
  });

  // the backend pushes this every second while a task is running (and always,
  // as a heartbeat) — use it to keep the live clock/progress bar advancing
  // without waiting for an unrelated state-changed re-render
  await listen("tick", () => {
    renderer.renderPlayer();
    renderer.renderNowPlaying();
  });

  // Tray menu-bar music controls (Play/Pause music, Next track) — the tray
  // itself can't touch the <audio> element, so it just asks the frontend to.
  await listen("music-toggle", () => {
    if (window.Music?.snapshot?.().playing) window.Music.pause();
    else window.Music?.play?.();
  });
  await listen("music-next", () => window.Music?.next?.());
})();
