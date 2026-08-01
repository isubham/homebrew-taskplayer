import { useCallback, useEffect, useState, useRef } from "react";
import type { JournalDocument, JournalEntrySummary } from "../bindings";
import { JOURNAL_COPY, JOURNAL_VIEW_KEY } from "../constants";
import { useRoute } from "../context/RouteProvider";
import { useLocalStorageSettings } from "../hooks/use-local-storage-settings";
import { LocalStorageRequired } from "./local-storage-required";
import { JournalEditor } from "./journal/journal-editor";
import { JournalEditorPage } from "./journal/journal-editor-page";
import { displayJournalDate, journalToday } from "./journal/journal-date";
import { JournalList } from "./journal/journal-list";
import { JournalSaveDialog } from "./journal/journal-save-dialog";
import { JournalViewer } from "./journal/journal-viewer";
import { useJournalEntryDeletion } from "./journal/use-journal-entry-deletion";
import { useJournalEntrySave } from "./journal/use-journal-entry-save";
import { useJournalExternalRefresh } from "./journal/use-journal-external-refresh";
import { useJournalNavigationGuard } from "./journal/use-journal-navigation-guard";
import { useJournalRelationOptions } from "./journal/use-journal-relation-options";
import { useMarkdownImages } from "../hooks/use-markdown-images";
import "./journal/journal.css";

import { SYSTEM_JOURNALING_TASK_ID, TIMER_PLAY_TRIGGERS } from "../constants";
import { useApp } from "../context/AppContext";

const { invoke } = window.__TAURI__.core;

type Screen = "list" | "editor" | "viewer";

export function JournalPage() {
  const { actions } = useApp();
  const { settings } = useLocalStorageSettings();
  const { state: { route }, actions: { navigate, enterJournalEntry } } = useRoute();
  const [screen, setScreen] = useState<Screen>("list");
  const [entries, setEntries] = useState<JournalEntrySummary[]>([]);
  const [document, setDocument] = useState<JournalDocument | null>(null);
  const [body, setBody] = useState("");
  const { pendingImages, setPendingImages, onPasteImage } = useMarkdownImages();
  const [showSave, setShowSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = screen === "editor"
    && Boolean(document)
    && (body !== document?.body || pendingImages.some(({ token }) => body.includes(token)));

  const previousTaskToResumeRef = useRef<string | null>(null);

  useEffect(() => {
    if (screen === "editor") {
      let isVisible = window.document.visibilityState === "visible";

      const handleVisibilityChange = () => {
        const currentlyVisible = window.document.visibilityState === "visible";
        if (currentlyVisible !== isVisible) {
          isVisible = currentlyVisible;
          if (isVisible) {
            void actions.play(SYSTEM_JOURNALING_TASK_ID, TIMER_PLAY_TRIGGERS.autoSession);
          } else {
            void actions.pause();
          }
        }
      };

      window.document.addEventListener("visibilitychange", handleVisibilityChange);

      void invoke("get_snapshot").then((snap: any) => {
        const activeTaskId = snap?.run?.activeTaskId;
        const isWorking = snap?.run?.phase === "work";

        if (activeTaskId && activeTaskId !== SYSTEM_JOURNALING_TASK_ID && isWorking) {
          previousTaskToResumeRef.current = activeTaskId;
        }

        if (isVisible) {
          void actions.play(SYSTEM_JOURNALING_TASK_ID, TIMER_PLAY_TRIGGERS.autoSession);
        }
      });

      return () => {
        window.document.removeEventListener("visibilitychange", handleVisibilityChange);
        void invoke("get_snapshot").then((snap: any) => {
          const run = snap?.run;
          if (run?.activeTaskId === SYSTEM_JOURNALING_TASK_ID) {
            if (run.phase === "work" || run.phase === "rest") {
              void actions.finishSession(false);
            }
          }
          if (previousTaskToResumeRef.current) {
             void actions.play(previousTaskToResumeRef.current, TIMER_PLAY_TRIGGERS.autoSession);
             previousTaskToResumeRef.current = null;
          }
        });
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

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
    if (route.journalEntryId) {
      void openEntry(route.journalEntryId);
      return;
    }
    setScreen((current) => current === "viewer" ? "list" : current);
  }, [openEntry, route.journalEntryId]);

  const createEntry = async () => {
    try {
      const next: JournalDocument = await invoke("new_journal_entry", { date: journalToday() });
      const draft = localStorage.getItem(`journal_draft_${next.id}`);
      setDocument(next);
      setBody(draft !== null ? draft : "");
      setPendingImages([]);
      setScreen("editor");
      setError("");
    } catch {
      setError(JOURNAL_COPY.loadError);
    }
  };

  const cancelEdit = () => {
    if (document) localStorage.removeItem(`journal_draft_${document.id}`);
    pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setPendingImages([]);
    setBody(document?.body || "");
    setScreen(document?.revision ? "viewer" : "list");
  };

  const editEntry = () => {
    if (!document) return;
    const draft = localStorage.getItem(`journal_draft_${document.id}`);
    setBody(draft !== null ? draft : document.body);
    setScreen("editor");
  };

  useEffect(() => {
    if (screen === "editor" && document) {
      const draftKey = `journal_draft_${document.id}`;
      if (body !== document.body) {
        localStorage.setItem(draftKey, body);
      } else {
        localStorage.removeItem(draftKey);
      }
    }
  }, [body, document, screen]);

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
      localStorage.removeItem(`journal_draft_${next.id}`);
      setDocument(next);
      setBody(next.body);
      pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setPendingImages([]);
      setShowSave(false);
      setScreen("viewer");
      setError("");
      if (!route.journalEntryId) enterJournalEntry(next.id);
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
  const hasSavedContext = Boolean(document?.revision && document.mood && document.relatedItems.length);
  const saveFromEditor = () => {
    if (hasSavedContext && document) {
      void save(document.mood, document.relatedItems);
      return;
    }
    setShowSave(true);
  };

  const deleteEntry = useJournalEntryDeletion({
    document,
    onDeleted: async () => {
      if (document) localStorage.removeItem(`journal_draft_${document.id}`);
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

  const editorPage = screen === "editor" && document
    ? (
      <JournalEditorPage>
        {error ? <p className="journal-error">{error}</p> : null}
        <JournalEditor dateLabel={displayJournalDate(document.date)} body={body} assets={document.assets} pendingImages={pendingImages} vimMode={settings.vimMode} onBodyChange={setBody} onPasteImage={onPasteImage} onSave={saveFromEditor} onCancel={cancelEdit} onDelete={document.revision ? () => void deleteEntry() : undefined} />
        {showSave ? <JournalSaveDialog saving={saving} initialMood={document.mood} initialRelatedItems={currentRelatedItems} relationOptions={relationOptions} onSave={(mood, relatedItems) => void save(mood, relatedItems)} onCancel={() => setShowSave(false)} /> : null}
      </JournalEditorPage>
    )
    : null;

  return (
    <div className="journal-page">
      {screen !== "editor" && error ? <p className="journal-error">{error}</p> : null}
      {screen === "list" ? <JournalList entries={entries} onCreate={() => void createEntry()} onOpen={(id) => void navigate({ view: JOURNAL_VIEW_KEY, journalEntryId: id })} /> : null}
      {screen === "viewer" && document ? <JournalViewer document={document} onEdit={editEntry} /> : null}
      {editorPage}
    </div>
  );
}
