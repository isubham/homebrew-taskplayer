import React, { useMemo, useState } from "react";
import type { Snapshot } from "../../bindings";
import { PLANNER_COPY, PLANNER_TIME_INPUT_STEP_SECONDS, SESSION_COPY } from "../../constants";
import { createRecordedSessionDraft, listAvailabilityContainsRange } from "../../planner/planner-time";
import { sessionConflictError } from "../../session-conflict";
import { parseSessionDraft, sessionDraftError, sessionDraftFromRange, type SessionDraft } from "../../session-time";
import { AnimatedModal } from "../motion-transitions";

type RecordSessionModalProps = {
  snapshot: Snapshot;
  anchorDay: number;
  initialRange?: { start: number; end: number } | null;
  onClose: () => void;
  onSave: (taskId: string, range: { start: number; end: number }) => void;
};

export function RecordSessionModal({ snapshot, anchorDay, initialRange, onClose, onSave }: RecordSessionModalProps) {
  const lists = useMemo(() => [...snapshot.lists].sort((left, right) => left.order - right.order), [snapshot.lists]);
  const fallbackDraft = createRecordedSessionDraft(anchorDay);
  const selectionRange = initialRange || parseSessionDraft(fallbackDraft);
  const matchingList = selectionRange
    ? lists.find((list) => snapshot.tasks.some((task) => task.listId === list.id)
      && listAvailabilityContainsRange(list, selectionRange))
    : null;
  const fallbackList = lists.find((list) => snapshot.tasks.some((task) => task.listId === list.id)) || lists[0];
  const [listId, setListId] = useState(matchingList?.id || fallbackList?.id || "");
  const tasks = useMemo(() => snapshot.tasks
    .filter((item) => item.listId === listId)
    .sort((left, right) => left.order - right.order), [snapshot.tasks, listId]);
  const initialTaskId = tasks[0]?.id || "";
  const [taskId, setTaskId] = useState(initialTaskId);
  const [draft, setDraft] = useState<SessionDraft>(() => initialRange
    ? sessionDraftFromRange(initialRange.start, initialRange.end)
    : createRecordedSessionDraft(anchorDay, tasks[0]));
  const task = tasks.find((item) => item.id === taskId);
  const range = parseSessionDraft(draft);
  const conflictError = range ? sessionConflictError(snapshot, range) : null;
  const validationError = !task
    ? PLANNER_COPY.recordTaskError
    : sessionDraftError(draft) || (range && range.end > Date.now() ? SESSION_COPY.futureEnd : null) || conflictError;
  const updateDraft = (field: keyof SessionDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!task || !range || validationError) return;
    onSave(task.id, range);
  };

  return (
    <AnimatedModal className="modal dlg planner-modal show" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="dtitle">{PLANNER_COPY.recordTitle}</div>
        <div className="dbody planner-form">
          <label className="lbl" htmlFor="record-session-list">{PLANNER_COPY.listLabel}</label>
          <select id="record-session-list" className="dinput" value={listId} onChange={(event) => {
            const nextListId = event.target.value;
            const nextTask = snapshot.tasks
              .filter((item) => item.listId === nextListId)
              .sort((left, right) => left.order - right.order)[0];
            setListId(nextListId);
            setTaskId(nextTask?.id || "");
            if (!initialRange) setDraft(createRecordedSessionDraft(anchorDay, nextTask));
          }}>
            {!lists.length ? <option value="">{PLANNER_COPY.noLists}</option> : null}
            {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
          </select>
          <label className="lbl" htmlFor="record-session-task">{PLANNER_COPY.taskLabel}</label>
          <select id="record-session-task" className="dinput" value={taskId} onChange={(event) => {
            const nextId = event.target.value;
            setTaskId(nextId);
            if (!initialRange) setDraft(createRecordedSessionDraft(anchorDay, tasks.find((item) => item.id === nextId)));
          }}>
            {!tasks.length ? <option value="">{PLANNER_COPY.noTasksInList}</option> : null}
            {tasks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <label className="lbl" htmlFor="record-session-date">{PLANNER_COPY.dateLabel}</label>
          <input id="record-session-date" className="dinput" type="date" value={draft.date} onChange={(event) => updateDraft("date", event.target.value)} />
          <div className="planner-form-times">
            <label><span className="lbl">{PLANNER_COPY.startLabel}</span><input className="dinput" type="time" step={PLANNER_TIME_INPUT_STEP_SECONDS} value={draft.start} onChange={(event) => updateDraft("start", event.target.value)} /></label>
            <label><span className="lbl">{PLANNER_COPY.endLabel}</span><input className="dinput" type="time" step={PLANNER_TIME_INPUT_STEP_SECONDS} value={draft.end} onChange={(event) => updateDraft("end", event.target.value)} /></label>
          </div>
          <div className={`session-time-feedback${validationError ? " error" : ""}`} aria-live="polite">{validationError || SESSION_COPY.overnightHint}</div>
        </div>
        <div className="dfoot">
          <button className="btn" type="button" onClick={onClose}>{PLANNER_COPY.cancelButton}</button>
          <button className="btn primary" type="submit" disabled={Boolean(validationError)}>{PLANNER_COPY.recordSaveButton}</button>
        </div>
      </form>
    </AnimatedModal>
  );
}
