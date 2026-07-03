import { bootstrapApp } from "./app/bootstrap.js";

(async function init() {
  const { appState, renderer } = bootstrapApp();
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  window.Music?.setOnChange((musicState) => renderer.renderMusic(musicState));

  const snapshot = await invoke("get_snapshot");
  appState.state.setSnapshot(snapshot);
  appState.state.setRoute("tasks", appState.state.activeListId);
  appState.state.lastPhase = snapshot.run.phase ?? null;
  renderer.render();

  await listen("state-changed", (event) => {
    appState.state.setSnapshot(event.payload);
    renderer.syncMusic();
    renderer.render();
  });
})();
