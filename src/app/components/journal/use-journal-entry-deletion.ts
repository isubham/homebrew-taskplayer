import type { JournalDocument } from "../../bindings";
import { JOURNAL_COPY } from "../../constants";
import { useUI } from "../../context/UIProvider";

const { invoke } = window.__TAURI__.core;

type JournalEntryDeletionOptions = {
  document: JournalDocument | null;
  onDeleted: () => Promise<void>;
  onError: () => void;
};

export function useJournalEntryDeletion(options: JournalEntryDeletionOptions) {
  const { actions } = useUI();

  return async () => {
    if (!options.document?.revision) return;
    const confirmed = await actions.uiConfirm(
      JOURNAL_COPY.deleteTitle,
      JOURNAL_COPY.deleteBody,
      JOURNAL_COPY.deleteConfirm,
    );
    if (!confirmed) return;
    try {
      await invoke("delete_journal_entry", {
        id: options.document.id,
        expectedRevision: options.document.revision,
      });
      await options.onDeleted();
    } catch {
      options.onError();
    }
  };
}
