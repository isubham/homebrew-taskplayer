import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalNoteDocument } from "../bindings";
import { LOCAL_NOTES_AUTOSAVE_DELAY_MS, LOCAL_NOTES_COPY } from "../constants";

const { invoke } = window.__TAURI__.core;

const INITIAL_STATUS = LOCAL_NOTES_COPY.savedStatus;

export function useLocalNote(taskId: string) {
  const [document, setDocument] = useState<LocalNoteDocument | null>(null);
  const [body, setBody] = useState("");
  const [savedBody, setSavedBody] = useState("");
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [conflictDocument, setConflictDocument] = useState<LocalNoteDocument | null>(null);
  const revisionRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const bodyRef = useRef(body);
  const savedBodyRef = useRef(savedBody);
  bodyRef.current = body;
  savedBodyRef.current = savedBody;

  const applyDocument = useCallback((next: LocalNoteDocument) => {
    setDocument(next);
    setBody(next.body);
    setSavedBody(next.body);
    revisionRef.current = next.revision;
    setConflictDocument(null);
    setStatus(!next.enabled
      ? LOCAL_NOTES_COPY.disabledStatus
      : next.available
        ? LOCAL_NOTES_COPY.savedStatus
        : LOCAL_NOTES_COPY.unavailableStatus);
  }, []);

  const saveBody = useCallback((
    pendingBody: string,
    expectedRevision: string | null,
    force: boolean,
  ) => {
    const operation = saveQueueRef.current.then(async () => {
      const currentRevision = force ? expectedRevision : revisionRef.current;
      setStatus(LOCAL_NOTES_COPY.savingStatus);
      try {
        const next: LocalNoteDocument = await invoke("save_local_note", {
          taskId, body: pendingBody, expectedRevision: currentRevision, force,
        });
        setDocument(next);
        setSavedBody(pendingBody);
        revisionRef.current = next.revision;
        setConflictDocument(null);
        setStatus(LOCAL_NOTES_COPY.savedStatus);
      } catch {
        try {
          const latest: LocalNoteDocument = await invoke("read_local_note", { taskId });
          if (latest.revision !== currentRevision) {
            setConflictDocument(latest);
            setStatus(LOCAL_NOTES_COPY.conflictStatus);
          } else {
            setStatus(LOCAL_NOTES_COPY.saveErrorStatus);
          }
        } catch {
          setStatus(LOCAL_NOTES_COPY.saveErrorStatus);
        }
      }
    });
    saveQueueRef.current = operation;
    return operation;
  }, [taskId]);

  const load = useCallback(async () => {
    try {
      applyDocument(await invoke("read_local_note", { taskId }));
    } catch {
      setStatus(LOCAL_NOTES_COPY.loadErrorStatus);
    }
  }, [applyDocument, taskId]);

  useEffect(() => {
    setDocument(null);
    setBody("");
    setSavedBody("");
    setStatus(LOCAL_NOTES_COPY.savingStatus);
    revisionRef.current = null;
    void load();
  }, [load]);

  useEffect(() => {
    if (!document?.enabled || !document.available || conflictDocument || body === savedBody) return;
    setStatus(LOCAL_NOTES_COPY.unsavedStatus);
    const expectedRevision = revisionRef.current;
    const pendingBody = body;
    const timer = window.setTimeout(
      () => void saveBody(pendingBody, expectedRevision, false),
      LOCAL_NOTES_AUTOSAVE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [body, conflictDocument, document?.available, document?.enabled, saveBody, savedBody]);

  useEffect(() => {
    const checkExternalChange = async () => {
      if (!document?.enabled || !document.available) return;
      try {
        const latest: LocalNoteDocument = await invoke("read_local_note", { taskId });
        if (latest.revision === revisionRef.current) return;
        if (bodyRef.current === savedBodyRef.current) {
          applyDocument(latest);
        } else {
          setConflictDocument(latest);
          setStatus(LOCAL_NOTES_COPY.conflictStatus);
        }
      } catch {
        setStatus(LOCAL_NOTES_COPY.loadErrorStatus);
      }
    };
    window.addEventListener("focus", checkExternalChange);
    return () => window.removeEventListener("focus", checkExternalChange);
  }, [applyDocument, document?.available, document?.enabled, taskId]);

  const forceSave = useCallback(async () => {
    await saveBody(bodyRef.current, conflictDocument?.revision || null, true);
  }, [conflictDocument?.revision, saveBody]);

  const saveNow = useCallback(async () => {
    if (!document?.enabled || !document.available || conflictDocument) return;
    if (bodyRef.current === savedBodyRef.current) return;
    await saveBody(bodyRef.current, revisionRef.current, false);
  }, [conflictDocument, document?.available, document?.enabled, saveBody]);

  const reloadExternal = useCallback(() => {
    if (conflictDocument) applyDocument(conflictDocument);
  }, [applyDocument, conflictDocument]);

  const openExternally = useCallback(async () => {
    try {
      await invoke("open_local_note_externally", { taskId });
      await load();
    } catch {
      setStatus(LOCAL_NOTES_COPY.saveErrorStatus);
    }
  }, [load, taskId]);

  return {
    document,
    body,
    status,
    conflict: !!conflictDocument,
    setBody,
    forceSave,
    saveNow,
    reloadExternal,
    openExternally,
  };
}
