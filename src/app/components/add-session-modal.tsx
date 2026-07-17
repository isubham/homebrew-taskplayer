import React from "react";
import { useApp } from "../context/AppContext.jsx";
import { AnimatedModal } from "./motion-transitions.jsx";
import { SESSION_COPY, SESSION_TIME_INPUT_MAX_LENGTH } from "../constants";
import { sessionDraftError } from "../session-time";

export function AddSessionModal() {
  const { state, actions, setDialogSession } = useApp();
  const dialog = state.dialog;
  if (!dialog) return null;
  const validationError = sessionDraftError(state.dialogSession);

  return (
    <AnimatedModal
      className="modal dlg show"
      id="dmodal"
      onClose={() => actions.resolveDialog(null)}
    >
        <div className="dtitle">{dialog.title}</div>
        <div className="dbody">
          <div className="session-date-row">
            <div>
              <label className="lbl">{SESSION_COPY.dateLabel}</label>
              <input
                className="dinput"
                type="date"
                aria-invalid={validationError === SESSION_COPY.invalidDate}
                aria-describedby="session-time-feedback"
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
                aria-describedby="session-time-feedback"
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
                aria-describedby="session-time-feedback"
                value={state.dialogSession?.end || ""}
                onChange={(e) => setDialogSession(prev => ({ ...prev, end: e.target.value }))}
              />
            </div>
          </div>
          <div id="session-time-feedback" aria-live="polite" className={`session-time-feedback${validationError ? " error" : ""}`}>
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
            Cancel
          </button>
          <button
            className={`btn ${dialog.danger ? "danger" : "primary"}`}
            id="dok"
            disabled={Boolean(validationError)}
            onClick={() => actions.resolveDialog(state.dialogSession)}
          >
            {dialog.confirmText || "OK"}
          </button>
        </div>
    </AnimatedModal>
  );
}
