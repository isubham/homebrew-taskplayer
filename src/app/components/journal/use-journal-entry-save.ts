import type { JournalDocument, JournalImageResult, JournalRelatedItem } from "../../bindings";
import { JOURNAL_COPY } from "../../constants";
import type { PendingMarkdownImage } from "../../hooks/use-markdown-images";

const { invoke } = window.__TAURI__.core;

type JournalEntrySaveOptions = {
  document: JournalDocument | null;
  body: string;
  pendingImages: PendingMarkdownImage[];
  onSaved: (document: JournalDocument) => Promise<void>;
  onError: (message: string) => void;
  onSavingChange: (saving: boolean) => void;
};

export function useJournalEntrySave(options: JournalEntrySaveOptions) {
  return async (mood: string | null, relatedItems: JournalRelatedItem[]) => {
    if (!options.document) return false;
    if (!options.body.trim() && !options.document.revision) return true;
    options.onSavingChange(true);
    try {
      let savedBody = options.body;
      for (const image of options.pendingImages.filter(({ token }) => options.body.includes(token))) {
        const result: JournalImageResult = await invoke("save_journal_image", {
          entryId: options.document.id,
          mimeType: image.file.type,
          bytes: new Uint8Array(await image.file.arrayBuffer()) as unknown as number[],
        });
        savedBody = savedBody.replace(image.token, result.markdown.slice(4, -1));
      }
      const saved: JournalDocument = await invoke("save_journal_entry", {
        id: options.document.id,
        date: options.document.date,
        createdAt: options.document.createdAt ?? Date.now(),
        body: savedBody,
        mood,
        relatedItems,
        expectedRevision: options.document.revision,
        force: false,
      });
      await options.onSaved(saved);
      return true;
    } catch (reason) {
      const message = String(reason);
      console.error("Journal entry save failed. Backend reason:", reason);
      options.onError(message.includes(JOURNAL_COPY.conflictMatch)
        ? JOURNAL_COPY.conflictError
        : `${JOURNAL_COPY.saveError} (${message})`);
      return false;
    } finally {
      options.onSavingChange(false);
    }
  };
}
