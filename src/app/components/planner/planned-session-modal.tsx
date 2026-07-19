import React, { useMemo, useState } from "react";
import type { PlannedSession, Snapshot } from "../../bindings";
import {
  PLANNER_COPY,
  PLANNER_FIELD_IDS,
  PLANNER_TIME_INPUT_STEP_SECONDS,
  SESSION_COPY,
} from "../../constants";
import { addLocalDays, createPlannerDraft, listAvailabilityContainsRange, startOfLocalDay, windowOccurrencesForDay } from "../../planner/planner-time";
import { parseSessionDraft, sessionDraftError, sessionDraftFromRange, type SessionDraft } from "../../session-time";
import { AnimatedModal } from "../motion-transitions";

type PlannedSessionModalProps = {
  snapshot: Snapshot;
  anchorDay: number;
  plan?: PlannedSession | null;
  initialTaskId?: string | null;
  initialRange?: { start: number; end: number } | null;
  onClose: () => void;
  onSave: (taskId: string, range: { start: number; end: number }) => void;
};

export function PlannedSessionModal({ snapshot, anchorDay, plan, initialTaskId, initialRange, onClose, onSave }: PlannedSessionModalProps) {
  const eligibleTasks = useMemo(() => snapshot.tasks
    .filter((task) => !task.completedAt && !task.cadence)
    .sort((left, right) => left.order - right.order), [snapshot.tasks]);
  const lists = useMemo(() => [...snapshot.lists].sort((left, right) => left.order - right.order), [snapshot.lists]);
  const requestedTask = eligibleTasks.find((item) => item.id === (initialTaskId || plan?.taskId));
  const fallbackDraft = createPlannerDraft(anchorDay);
  const selectionRange = plan?.start != null && plan.end != null
    ? { start: plan.start, end: plan.end }
    : initialRange || parseSessionDraft(fallbackDraft);
  const matchingList = selectionRange
    ? lists.find((list) => eligibleTasks.some((task) => task.listId === list.id)
      && listAvailabilityContainsRange(list, selectionRange))
    : null;
  const fallbackList = lists.find((list) => eligibleTasks.some((task) => task.listId === list.id)) || lists[0];
  const initialListId = requestedTask?.listId || matchingList?.id || fallbackList?.id || "";
  const [listId, setListId] = useState(initialListId);
  const tasks = useMemo(() => eligibleTasks.filter((item) => item.listId === listId), [eligibleTasks, listId]);
  const initialTaskIdForList = requestedTask?.listId === initialListId ? requestedTask.id : tasks[0]?.id || "";
  const initialTask = tasks.find((item) => item.id === initialTaskIdForList);
  const initialDraft = plan?.start != null && plan.end != null
    ? sessionDraftFromRange(plan.start, plan.end)
    : initialRange
      ? sessionDraftFromRange(initialRange.start, initialRange.end)
    : createPlannerDraft(anchorDay, initialTask);
  const [taskId, setTaskId] = useState(initialTaskIdForList);
  const [draft, setDraft] = useState<SessionDraft>(initialDraft);
  const selectedTask = tasks.find((item) => item.id === taskId);
  const range = parseSessionDraft(draft);
  const validationError = !selectedTask
    ? PLANNER_COPY.invalidTask
    : sessionDraftError(draft) || (range && range.end <= Date.now() ? PLANNER_COPY.pastPlanError : null);
  const selectedList = lists.find((list) => list.id === listId);
  const availability = selectedList?.availabilityWindows || [];
  const insideAvailability = !range || !availability.length || (selectedList && listAvailabilityContainsRange(selectedList, range));
  const overlapsPlan = range && (snapshot.plannedSessions || []).some((item) =>
    item.id !== plan?.id && item.start != null && item.end != null
      && range.start < item.end && range.end > item.start);
  const overlapsRoutine = range && snapshot.tasks.some((item) => item.cadence &&
    [startOfLocalDay(range.start), addLocalDays(startOfLocalDay(range.start), 1)].some((dayStart) =>
      (item.dailyWindows || []).some((window) => windowOccurrencesForDay(window, dayStart)
        .some((occurrence) => range.start < occurrence.end && range.end > occurrence.start))));

  const updateDraft = (field: keyof SessionDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const range = parseSessionDraft(draft);
    if (!selectedTask || !range || validationError) return;
    onSave(selectedTask.id, range);
  };

  return (
    <AnimatedModal className="modal dlg planner-modal show" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="dtitle">{plan ? PLANNER_COPY.editTitle : PLANNER_COPY.createTitle}</div>
        <div className="dbody planner-form">
          <label className="lbl" htmlFor={PLANNER_FIELD_IDS.list}>{PLANNER_COPY.listLabel}</label>
          <select id={PLANNER_FIELD_IDS.list} className="dinput" value={listId} onChange={(event) => {
            const nextListId = event.target.value;
            const nextTask = eligibleTasks.find((item) => item.listId === nextListId);
            setListId(nextListId);
            setTaskId(nextTask?.id || "");
            if (!plan && !initialRange) setDraft(createPlannerDraft(anchorDay, nextTask));
          }}>
            {!lists.length ? <option value="">{PLANNER_COPY.noListsForPlanning}</option> : null}
            {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
          </select>
          <label className="lbl" htmlFor={PLANNER_FIELD_IDS.task}>{PLANNER_COPY.taskLabel}</label>
          <select id={PLANNER_FIELD_IDS.task} className="dinput" value={taskId} onChange={(event) => {
            const nextId = event.target.value;
            setTaskId(nextId);
            const nextTask = tasks.find((item) => item.id === nextId);
            if (!plan && !initialRange) setDraft(createPlannerDraft(anchorDay, nextTask));
          }}>
            {!tasks.length ? <option value="">{PLANNER_COPY.noPlannableTasksInList}</option> : null}
            {tasks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <label className="lbl" htmlFor={PLANNER_FIELD_IDS.date}>{PLANNER_COPY.dateLabel}</label>
          <input id={PLANNER_FIELD_IDS.date} className="dinput" type="date" value={draft.date} onChange={(event) => updateDraft("date", event.target.value)} />
          <div className="planner-form-times">
            <label><span className="lbl">{PLANNER_COPY.startLabel}</span><input className="dinput" type="time" step={PLANNER_TIME_INPUT_STEP_SECONDS} value={draft.start} onChange={(event) => updateDraft("start", event.target.value)} /></label>
            <label><span className="lbl">{PLANNER_COPY.endLabel}</span><input className="dinput" type="time" step={PLANNER_TIME_INPUT_STEP_SECONDS} value={draft.end} onChange={(event) => updateDraft("end", event.target.value)} /></label>
          </div>
          <div className={`session-time-feedback${validationError ? " error" : ""}`} aria-live="polite">
            {validationError || SESSION_COPY.overnightHint}
          </div>
          {!validationError && (!insideAvailability || overlapsPlan || overlapsRoutine) ? (
            <div className="planner-form-notices" aria-live="polite">
              {!insideAvailability ? <span>{PLANNER_COPY.outsideAvailabilityNotice}</span> : null}
              {overlapsPlan || overlapsRoutine ? <span>{PLANNER_COPY.overlapNotice}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="dfoot">
          <button className="btn" type="button" onClick={onClose}>{PLANNER_COPY.cancelButton}</button>
          <button className="btn primary" type="submit" disabled={Boolean(validationError)}>{PLANNER_COPY.saveButton}</button>
        </div>
      </form>
    </AnimatedModal>
  );
}
