import { useCallback, useEffect, useState } from "react";
import type { LocalNotesSettings } from "../bindings";
import { LOCAL_NOTES_COPY } from "../constants";

const { invoke } = window.__TAURI__.core;

export function useLocalStorageSettings() {
  const [settings, setSettings] = useState<LocalNotesSettings | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setSettings(await invoke("get_local_notes_settings"));
      setError("");
    } catch {
      setError(LOCAL_NOTES_COPY.settingsError);
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return { settings, setSettings, error, setError, refresh };
}
