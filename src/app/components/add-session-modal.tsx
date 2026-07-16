import React from "react";
import { useApp } from "../context/AppContext.jsx";
import { AnimatedModal } from "./motion-transitions.jsx";

export function AddSessionModal() {
  const { state, actions, setDialogSession } = useApp();

  return (
    <AnimatedModal
      className="modal dlg show"
      id="dmodal"
      onClose={() => actions.resolveDialog(null)}
    >
        <div className="dtitle">{state.dialog.title}</div>
        <div className="dbody">
          <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <label className="lbl">Date</label>
              <input
                className="dinput"
                type="date"
                value={state.dialogSession?.date || ""}
                onChange={(e) => setDialogSession(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div style={{ width: "90px" }}>
              <label className="lbl">Start time</label>
              <input
                className="dinput"
                type="time"
                value={state.dialogSession?.start || ""}
                onChange={(e) => setDialogSession(prev => ({ ...prev, start: e.target.value }))}
              />
            </div>
            <div style={{ width: "90px" }}>
              <label className="lbl">End time</label>
              <input
                className="dinput"
                type="time"
                value={state.dialogSession?.end || ""}
                onChange={(e) => setDialogSession(prev => ({ ...prev, end: e.target.value }))}
              />
            </div>
          </div>
          {state.dialog.subtitle && (
            <div className="dbody" style={{ fontSize: "12px", color: "#888", marginBottom: "12px", padding: 0 }}>
              {state.dialog.subtitle}
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
            className={`btn ${state.dialog.danger ? "danger" : "primary"}`}
            id="dok"
            onClick={() => actions.resolveDialog(state.dialogSession)}
          >
            {state.dialog.confirmText || "OK"}
          </button>
        </div>
    </AnimatedModal>
  );
}
