import { useEffect, useRef } from "react";
import type { JournalDocument } from "../../bindings";

const { invoke } = window.__TAURI__.core;

type JournalExternalRefreshOptions = {
  active: boolean;
  document: JournalDocument | null;
  onRefresh: (document: JournalDocument) => void;
  onError: () => void;
};

export function useJournalExternalRefresh(options: JournalExternalRefreshOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const refresh = async () => {
      const current = optionsRef.current;
      if (!current.active || !current.document) return;
      try {
        const latest: JournalDocument = await invoke("read_journal_entry", { id: current.document.id });
        if (latest.revision !== current.document.revision) current.onRefresh(latest);
      } catch {
        current.onError();
      }
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
}
