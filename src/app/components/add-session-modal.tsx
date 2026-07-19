import React from "react";
import { useApp } from "../context/AppContext.jsx";
import { AnimatedModal } from "./motion-transitions.jsx";
import { SESSION_COPY, SESSION_FIELD_IDS, SESSION_TIME_INPUT_MAX_LENGTH } from "../constants";
import { sessionConflictError } from "../session-conflict";
import { parseSessionDraft, sessionDraftError } from "../session-time";

export function AddSessionModal() {
  const { state, actions, setDialogSession } = useApp();
  const dialog = state.dialog;
  if (!dialog) return null;
  const lists = [...(state.S?.lists || [])].sort((left, right) => left.order - right.order);
  const listId = state.dialogSession?.listId || "";
  const tasks = (state.S?.tasks || [])
    .filter((task) => task.listId === listId)
    .sort((left, right) => left.order - right.order);
  const selectedTask = tasks.find((task) => task.id === state.dialogSession?.taskId);
  const selectionError = !dialog.sessionTaskSelection
    ? null
    : !lists.length
      ? SESSION_COPY.noLists
      : !tasks.length
        ? SESSION_COPY.noTasksInList
        : !selectedTask
          ? SESSION_COPY.chooseTask
          : null;
  const range = parseSessionDraft(state.dialogSession);
  const conflictError = range && state.S
    ? sessionConflictError(state.S, range, state.dialogSession?.sessionId)
    : null;
  const validationError = selectionError || sessionDraftError(state.dialogSession) || conflictError;

  return (
    <AnimatedModal
      className="modal dlg show"
      id="dmodal"
      onClose={() => actions.resolveDialog(null)}
    >
        <div className="dtitle">{dialog.title}</div>
        <div className="dbody">
          {dialog.sessionTaskSelection ? (
            <>
              <div className="session-date-row">
                <label className="lbl" htmlFor={SESSION_FIELD_IDS.list}>{SESSION_COPY.listLabel}</label>
                <select
                  id={SESSION_FIELD_IDS.list}
                  className="dinput"
                  value={listId}
                  aria-invalid={!lists.length}
                  onChange={(event) => setDialogSession((previous) => ({
                    ...previous,
                    listId: event.target.value,
                    taskId: "",
                  }))}
                >
                  {!lists.length ? <option value="">{SESSION_COPY.noLists}</option> : null}
                  {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                </select>
              </div>
              <div className="session-date-row">
                <label className="lbl" htmlFor={SESSION_FIELD_IDS.task}>{SESSION_COPY.taskLabel}</label>
                <select
                  id={SESSION_FIELD_IDS.task}
                  className="dinput"
                  value={state.dialogSession?.taskId || ""}
                  aria-invalid={!selectedTask}
                  disabled={!tasks.length}
                  onChange={(event) => setDialogSession((previous) => ({ ...previous, taskId: event.target.value }))}
                >
                  {!selectedTask ? <option value="">{tasks.length ? SESSION_COPY.chooseTask : SESSION_COPY.noTasksInList}</option> : null}
                  {tasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
                </select>
              </div>
            </>
          ) : null}
          <div className="session-date-row">
            <div>
              <label className="lbl">{SESSION_COPY.dateLabel}</label>
              <input
                className="dinput"
                type="date"
                aria-invalid={validationError === SESSION_COPY.invalidDate}
                aria-describedby={SESSION_FIELD_IDS.feedback}
                value={state.dialogSession?.date || ""}
                onChange={(e) => setDialogSession(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>
          </div>
          <div className="session-time-fields">
            <div className="session-time-field">
              <label className="lbl">{SESSION_COPY.startTimeLabel}</label>
              <input
                className="dinput"
                type="text"
                inputMode="numeric"
                placeholder={SESSION_COPY.timePlaceholder}
                maxLength={SESSION_TIME_INPUT_MAX_LENGTH}
                aria-invalid={validationError === SESSION_COPY.invalidStartTime}
                aria-describedby={SESSION_FIELD_IDS.feedback}
                value={state.dialogSession?.start || ""}
                onChange={(e) => setDialogSession(prev => ({ ...prev, start: e.target.value }))}
              />
            </div>
            <div className="session-time-field">
              <label className="lbl">{SESSION_COPY.endTimeLabel}</label>
              <input
                className="dinput"
                type="text"
                inputMode="numeric"
                placeholder={SESSION_COPY.timePlaceholder}
                maxLength={SESSION_TIME_INPUT_MAX_LENGTH}
                aria-invalid={validationError === SESSION_COPY.invalidEndTime || validationError === SESSION_COPY.equalTimes}
                aria-describedby={SESSION_FIELD_IDS.feedback}
                value={state.dialogSession?.end || ""}
                onChange={(e) => setDialogSession(prev => ({ ...prev, end: e.target.value }))}
              />
            </div>
          </div>
          <div id={SESSION_FIELD_IDS.feedback} aria-live="polite" className={`session-time-feedback${validationError ? " error" : ""}`}>
            {validationError || SESSION_COPY.overnightHint}
          </div>
          {dialog.subtitle && (
            <div className="dbody" style={{ fontSize: "12px", color: "#888", marginBottom: "12px", padding: 0 }}>
              {dialog.subtitle}
            </div>
          )}
        </div>
        <div className="dfoot">
          <button
            className="btn"
            id="dcancel"
            onClick={() => actions.resolveDialog(null)}
          >
            {SESSION_COPY.cancelButton}
          </button>
          <button
            className={`btn ${dialog.danger ? "danger" : "primary"}`}
            id="dok"
            disabled={Boolean(validationError)}
            onClick={() => actions.resolveDialog(state.dialogSession)}
          >
            {dialog.confirmText || SESSION_COPY.confirmButton}
          </button>
        </div>
    </AnimatedModal>
  );
}
