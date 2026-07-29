import { useCallback, useEffect, useState } from "react";
import type { JournalDocument, JournalEntrySummary } from "../bindings";
import { JOURNAL_COPY } from "../constants";
import { useRoute } from "../context/RouteProvider";
import { useLocalStorageSettings } from "../hooks/use-local-storage-settings";
import { LocalStorageRequired } from "./local-storage-required";
import { JournalEditor, type PendingJournalImage } from "./journal/journal-editor";
import { displayJournalDate, journalToday } from "./journal/journal-date";
import { JournalList } from "./journal/journal-list";
import { JournalSaveDialog } from "./journal/journal-save-dialog";
import { JournalViewer } from "./journal/journal-viewer";
import { useJournalEntryDeletion } from "./journal/use-journal-entry-deletion";
import { useJournalEntrySave } from "./journal/use-journal-entry-save";
import { useJournalExternalRefresh } from "./journal/use-journal-external-refresh";
import { useJournalNavigationGuard } from "./journal/use-journal-navigation-guard";
import { useJournalRelationOptions } from "./journal/use-journal-relation-options";
import "./journal/journal.css";

const { invoke } = window.__TAURI__.core;
type Screen = "list" | "editor" | "viewer";

export function JournalPage() {
  const { settings } = useLocalStorageSettings();
  const { state: { journalTarget }, actions: { clearJournalTarget } } = useRoute();
  const [screen, setScreen] = useState<Screen>("list");
  const [entries, setEntries] = useState<JournalEntrySummary[]>([]);
  const [document, setDocument] = useState<JournalDocument | null>(null);
  const [body, setBody] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingJournalImage[]>([]);
  const [showSave, setShowSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = screen === "editor"
    && Boolean(document)
    && (body !== document?.body || pendingImages.some(({ token }) => body.includes(token)));

  const loadList = useCallback(async () => {
    if (!settings?.available) return;
    try {
      setEntries(await invoke("list_journal_entries"));
      setError("");
    } catch {
      setError(JOURNAL_COPY.loadError);
    }
  }, [settings?.available]);

  useEffect(() => {
    void loadList();
    window.addEventListener("focus", loadList);
    return () => window.removeEventListener("focus", loadList);
  }, [loadList]);

  const openEntry = useCallback(async (id: string) => {
    try {
      const next: JournalDocument = await invoke("read_journal_entry", { id });
      setPendingImages((current) => {
        current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
        return [];
      });
      setDocument(next);
      setBody(next.body);
      setScreen("viewer");
      setError("");
    } catch {
      setError(JOURNAL_COPY.loadError);
    }
  }, []);

  useEffect(() => {
    if (!journalTarget?.entryId) return;
    void openEntry(journalTarget.entryId).finally(clearJournalTarget);
  }, [clearJournalTarget, journalTarget?.entryId, openEntry]);

  const createEntry = async () => {
    try {
      const next: JournalDocument = await invoke("new_journal_entry", { date: journalToday() });
      setDocument(next);
      setBody("");
      setPendingImages([]);
      setScreen("editor");
      setError("");
    } catch {
      setError(JOURNAL_COPY.loadError);
    }
  };

  const cancelEdit = () => {
    pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setPendingImages([]);
    setBody(document?.body || "");
    setScreen(document?.revision ? "viewer" : "list");
  };

  useJournalExternalRefresh({
    active: screen === "viewer",
    document,
    onRefresh: (latest) => {
      setDocument(latest);
      setBody(latest.body);
    },
    onError: () => setError(JOURNAL_COPY.loadError),
  });

  const save = useJournalEntrySave({
    document,
    body,
    pendingImages,
    onSaved: async (next) => {
      setDocument(next);
      setBody(next.body);
      pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setPendingImages([]);
      setShowSave(false);
      setScreen("viewer");
      setError("");
      await loadList();
    },
    onError: (message) => {
      setError(message);
      setShowSave(false);
    },
    onSavingChange: setSaving,
  });
  useJournalNavigationGuard(dirty, () => save(document?.mood || null, document?.relatedItems || []));
  const relationOptions = useJournalRelationOptions();
  const currentRelatedItems = document?.relatedItems.map((item) => (
    relationOptions.find((option) => option.kind === item.kind && option.id === item.id) || item
  )) || [];

  const deleteEntry = useJournalEntryDeletion({
    document,
    onDeleted: async () => {
      pendingImages.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
      setPendingImages([]);
      setDocument(null);
      setBody("");
      setScreen("list");
      setError("");
      await loadList();
    },
    onError: () => setError(JOURNAL_COPY.deleteError),
  });

  if (!settings) return <div className="journal-page" />;
  if (!settings.enabled) return <div className="journal-page"><LocalStorageRequired /></div>;
  if (!settings.available) return <div className="journal-page"><LocalStorageRequired unavailable /></div>;

  return (
    <div className={`journal-page${screen === "editor" ? " journal-page-editor" : ""}`}>
      {error ? <p className="journal-error">{error}</p> : null}
      {screen === "list" ? <JournalList entries={entries} onCreate={() => void createEntry()} onOpen={(id) => void openEntry(id)} /> : null}
      {screen === "editor" && document ? <JournalEditor dateLabel={displayJournalDate(document.date)} body={body} pendingImages={pendingImages} vimMode={settings.vimMode} onBodyChange={setBody} onPendingImagesChange={setPendingImages} onSave={() => setShowSave(true)} onCancel={cancelEdit} onDelete={document.revision ? () => void deleteEntry() : undefined} /> : null}
      {screen === "viewer" && document ? <JournalViewer document={document} onBack={() => setScreen("list")} onEdit={() => setScreen("editor")} onOpenExternally={() => void invoke("open_journal_entry_externally", { id: document.id })} /> : null}
      {showSave && document ? <JournalSaveDialog saving={saving} initialMood={document.mood} initialRelatedItems={currentRelatedItems} relationOptions={relationOptions} onSave={(mood, relatedItems) => void save(mood, relatedItems)} onCancel={() => setShowSave(false)} /> : null}
    </div>
  );
}
