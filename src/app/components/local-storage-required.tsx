import { CloudOff, FolderLock } from "lucide-react";
import { useApp } from "../context/AppContext";
import {
  LOCAL_STORAGE_COPY,
  LOCAL_STORAGE_SETTINGS_KEY,
  SETTINGS_SECTION_STORAGE_KEY,
} from "../constants";
import "./local-storage.css";

type LocalStorageRequiredProps = {
  unavailable?: boolean;
};

export function LocalStorageRequired({ unavailable = false }: LocalStorageRequiredProps) {
  const { actions } = useApp();
  const title = unavailable ? LOCAL_STORAGE_COPY.unavailableTitle : LOCAL_STORAGE_COPY.requiredTitle;
  const description = unavailable
    ? LOCAL_STORAGE_COPY.unavailableDescription
    : LOCAL_STORAGE_COPY.requiredDescription;
  const action = unavailable ? LOCAL_STORAGE_COPY.reconnectAction : LOCAL_STORAGE_COPY.setupAction;

  const openSettings = () => {
    localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, LOCAL_STORAGE_SETTINGS_KEY);
    actions.setOpenTaskId?.(null);
    actions.navigate({ view: "settings" });
  };

  return (
    <section className="local-storage-required">
      <span className="local-storage-required-icon"><FolderLock aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="pill primary" type="button" onClick={openSettings}>{action}</button>
      <small><CloudOff aria-hidden="true" />{LOCAL_STORAGE_COPY.privacyHint}</small>
    </section>
  );
}
