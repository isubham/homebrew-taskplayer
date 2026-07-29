import { open } from "@tauri-apps/plugin-dialog";
import { CloudOff, FolderLock, FolderOpen, FolderPlus } from "lucide-react";
import { LOCAL_NOTES_COPY, LOCAL_NOTES_ICON_SIZES } from "../constants";
import { useLocalStorageSettings } from "../hooks/use-local-storage-settings";
import "./local-notes.css";

const { invoke } = window.__TAURI__.core;

export function LocalNotesSettingsSection() {
  const { settings, setSettings, error, setError } = useLocalStorageSettings();

  const chooseFolder = async () => {
    const path = await open({
      directory: true,
      multiple: false,
      title: LOCAL_NOTES_COPY.folderPickerTitle,
    });
    if (!path) return;
    try {
      setSettings(await invoke("set_local_notes_directory", { path }));
      setError("");
    } catch {
      setError(LOCAL_NOTES_COPY.settingsError);
    }
  };

  const disable = async () => {
    try {
      setSettings(await invoke("disable_local_notes"));
      setError("");
    } catch {
      setError(LOCAL_NOTES_COPY.settingsError);
    }
  };

  const toggleVimMode = async () => {
    if (!settings) return;
    try {
      setSettings(await invoke("set_local_notes_vim_mode", { enabled: !settings.vimMode }));
      setError("");
    } catch {
      setError(LOCAL_NOTES_COPY.settingsError);
    }
  };

  const revealFolder = async () => {
    try {
      await invoke("reveal_local_notes_directory");
      setError("");
    } catch {
      setError(LOCAL_NOTES_COPY.settingsError);
    }
  };

  return (
    <section className="local-notes-settings">
      <div className="local-notes-settings-title">
        <FolderLock size={LOCAL_NOTES_ICON_SIZES.settings} />
        <h4>{LOCAL_NOTES_COPY.settingsHeading}</h4>
        <span className="local-notes-badge"><CloudOff size={LOCAL_NOTES_ICON_SIZES.badge} />{LOCAL_NOTES_COPY.noCloudBadge}</span>
      </div>
      <p className="hint">{LOCAL_NOTES_COPY.settingsDescription}</p>
      <p className="hint">{LOCAL_NOTES_COPY.cloudFolderWarning}</p>

      {settings?.enabled ? (
        <>
          <div className={`local-notes-folder${settings.available ? "" : " unavailable"}`}>
            <span>{settings.available ? LOCAL_NOTES_COPY.connectedStatus : LOCAL_NOTES_COPY.unavailableStatus}</span>
            <code>{settings.rootPath}</code>
          </div>
          <div className="setrow local-notes-settings-actions">
            {settings.available ? (
              <button className="pill" type="button" onClick={() => void revealFolder()}>
                <FolderOpen size={LOCAL_NOTES_ICON_SIZES.action} />{LOCAL_NOTES_COPY.revealFolder}
              </button>
            ) : null}
            <button className="pill" type="button" onClick={() => void chooseFolder()}>
              <FolderPlus size={LOCAL_NOTES_ICON_SIZES.action} />{settings.available ? LOCAL_NOTES_COPY.changeFolder : LOCAL_NOTES_COPY.reconnectFolder}
            </button>
            <button className="pill" type="button" onClick={() => void disable()}>{LOCAL_NOTES_COPY.disable}</button>
          </div>
          <p className="hint">{LOCAL_NOTES_COPY.disconnectHint}</p>
          <div className="setrow local-notes-vim-setting">
            <div>
              <strong>{LOCAL_NOTES_COPY.vimModeTitle}</strong>
              <p className="hint">{LOCAL_NOTES_COPY.vimModeDescription}</p>
            </div>
            <button
              type="button"
              className={`settings-switch${settings.vimMode ? " on" : ""}`}
              role="switch"
              aria-checked={settings.vimMode}
              aria-label={LOCAL_NOTES_COPY.vimModeToggleLabel}
              title={settings.vimMode ? LOCAL_NOTES_COPY.disableVimMode : LOCAL_NOTES_COPY.enableVimMode}
              onClick={() => void toggleVimMode()}
            >
              <span className="settings-switch-knob" />
            </button>
          </div>
        </>
      ) : (
        <div className="setrow">
          <span className="hint">{LOCAL_NOTES_COPY.disabledStatus}</span>
          <button className="pill" type="button" onClick={() => void chooseFolder()}>
            <FolderPlus size={LOCAL_NOTES_ICON_SIZES.action} />{LOCAL_NOTES_COPY.chooseFolder}
          </button>
        </div>
      )}
      {error ? <p className="hint hint-error">{error}</p> : null}
    </section>
  );
}
