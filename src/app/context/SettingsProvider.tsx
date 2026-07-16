import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "../constants.jsx";

const { invoke } = window.__TAURI__.core;

const SettingsContext = createContext(null);

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("tp.sidebarCollapsed") || "{}"); }
    catch { return {}; }
  });
  const [lifeBalanceAgainst, setLifeBalanceAgainst] = useState(() => {
    return (localStorage.getItem("tp.lifeAgainst") ?? "0") === "1";
  });
  const [keybindings, setKeybindings] = useState(() => {
    return (localStorage.getItem("tp.keybindings") ?? "1") === "1";
  });
  const [insightsPeriod, setInsightsPeriod] = useState("7d");
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

  // Load sound options once
  useEffect(() => {
    invoke("sound_options").then((res) => {
      if (Array.isArray(res)) setSoundOptions(res);
    }).catch(console.error);
  }, []);

  return (
    <SettingsContext.Provider value={{
      state: {
        sidebarCollapsed, lifeBalanceAgainst, keybindings, insightsPeriod,
        sessionGroupsCollapsed, zoomLevel, soundOptions
      },
      actions: {
        setSidebarCollapsed, setLifeBalanceAgainst, setKeybindings,
        setInsightsPeriod, setSessionGroupsCollapsed, setZoom
      }
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
