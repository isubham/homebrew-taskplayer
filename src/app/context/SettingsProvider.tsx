import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

import { KEYBINDINGS_STORAGE_KEY, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "../constants.jsx";
import { commands } from "../bindings";
import { useCore } from "./CoreProvider.jsx";

const { invoke } = window.__TAURI__.core;

const SettingsContext = createContext(null);

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }) {
  const { S, apply } = useCore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("tp.sidebarCollapsed") || "{}"); }
    catch { return {}; }
  });
  const [lifeBalanceAgainst, setLifeBalanceAgainst] = useState(() => {
    return (localStorage.getItem("tp.lifeAgainst") ?? "0") === "1";
  });
  const [keybindings, setKeybindingsState] = useState(() => {
    return (localStorage.getItem(KEYBINDINGS_STORAGE_KEY) ?? "1") === "1";
  });
  const [insightsPeriod, setInsightsPeriod] = useState("7d");
  const audioInterruptionEnabled = S?.userSettings?.pauseForOtherAudio ?? true;
  const musicPlayerTakeoverEnabled = S?.userSettings?.takeOverMusicPlayers ?? false;
  const settingsLoaded = !!S;
  const [audioInterruptionCapability, setAudioInterruptionCapability] = useState({ available: null, enabled: false });
  const [sessionGroupsCollapsed, setSessionGroupsCollapsed] = useState({});
  const [soundOptions, setSoundOptions] = useState([]);

  // Zoom management
  const [zoomLevel, setZoomLevelState] = useState(() => {
    try {
      const saved = Number.parseFloat(localStorage.getItem("tp.zoom") || "1");
      return Number.isFinite(saved) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, saved)) : 1;
    } catch (_) {
      return 1;
    }
  });
  const zoomRequestIdRef = useRef(0);
  const zoomQueueRef = useRef(Promise.resolve());

  const setZoom = useCallback((next) => {
    const nextLevel = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 10) / 10;
    setZoomLevelState(nextLevel);
    zoomRequestIdRef.current++;
    zoomQueueRef.current = zoomQueueRef.current.then(async () => {
      await invoke("set_app_zoom", { scale: nextLevel });
      localStorage.setItem("tp.zoom", String(nextLevel));
    }).catch(console.error);
  }, []);

  const setKeybindings = useCallback((nextValue) => {
    setKeybindingsState((current) => {
      const next = typeof nextValue === "function" ? !!nextValue(current) : !!nextValue;
      localStorage.setItem(KEYBINDINGS_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const toggleKeybindings = useCallback(() => setKeybindings((current) => !current), [setKeybindings]);

  const setAudioInterruptionEnabled = useCallback(async (requested) => {
    try {
      const snapshot = await commands.setPauseForOtherAudio(!!requested);
      apply(snapshot);
    } catch (error) {
      console.error("Failed to save audio interruption preference:", error);
    }
  }, [apply]);

  const setMusicPlayerTakeoverEnabled = useCallback(async (requested) => {
    try {
      const snapshot = await commands.setMusicPlayerTakeover(!!requested);
      apply(snapshot);
    } catch (error) {
      console.error("Failed to save music-player takeover preference:", error);
    }
  }, [apply]);

  // Load sound options once
  useEffect(() => {
    invoke("sound_options").then((res) => {
      if (Array.isArray(res)) setSoundOptions(res);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    commands.setAudioInterruptionMonitoring(audioInterruptionEnabled)
      .then(setAudioInterruptionCapability)
      .catch((error) => {
        console.error("Failed to update audio interruption monitoring:", error);
        setAudioInterruptionCapability({ available: false, enabled: false });
      });
  }, [settingsLoaded, audioInterruptionEnabled]);

  return (
    <SettingsContext.Provider value={{
      state: {
        sidebarCollapsed, lifeBalanceAgainst, keybindings, insightsPeriod,
        audioInterruptionEnabled, audioInterruptionCapability, musicPlayerTakeoverEnabled,
        sessionGroupsCollapsed, zoomLevel, soundOptions
      },
      actions: {
        setSidebarCollapsed, setLifeBalanceAgainst, setKeybindings, toggleKeybindings,
        setInsightsPeriod, setSessionGroupsCollapsed, setZoom, setAudioInterruptionEnabled,
        setMusicPlayerTakeoverEnabled
      }
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
