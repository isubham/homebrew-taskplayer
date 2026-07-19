import { CalendarClock, LoaderCircle } from "lucide-react";
import type { AutomaticPlanPreview, Snapshot } from "../../bindings";
import {
  AUTOMATIC_PLAN_CAPACITY_PERCENT,
  AUTOMATIC_PLAN_COPY,
  AUTOMATIC_PLAN_DATE_FORMAT,
  PLANNER_FIELD_IDS,
  PLANNER_ICON_SIZE,
} from "../../constants";
import { sessionRangeLabel } from "../../session-time";
import { AnimatedModal } from "../motion-transitions";

type AutomaticPlanModalProps = {
  snapshot: Snapshot;
  preview: AutomaticPlanPreview;
  busy: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onAccept: () => void;
};

export function AutomaticPlanModal({
  snapshot,
  preview,
  busy,
  onClose,
  onRefresh,
  onAccept,
}: AutomaticPlanModalProps) {
  const tasks = new Map(snapshot.tasks.map((task) => [task.id, task]));
  const lists = new Map(snapshot.lists.map((list) => [list.id, list]));
  const suggestions = preview.suggestions.filter((item) => item.start != null && item.end != null);
  const capacity = Math.max(preview.capacityMinutes, 1);
  const existingPercent = Math.min(
    AUTOMATIC_PLAN_CAPACITY_PERCENT,
    (preview.existingPlannedMinutes / capacity) * AUTOMATIC_PLAN_CAPACITY_PERCENT,
  );
  const suggestedPercent = Math.min(
    AUTOMATIC_PLAN_CAPACITY_PERCENT - existingPercent,
    (preview.suggestedMinutes / capacity) * AUTOMATIC_PLAN_CAPACITY_PERCENT,
  );
  const openMinutes = Math.max(
    0,
    preview.capacityMinutes - preview.existingPlannedMinutes - preview.suggestedMinutes,
  );

  return (
    <AnimatedModal className="modal dlg automatic-plan-modal show" onClose={onClose}>
      <div className="dtitle" id={PLANNER_FIELD_IDS.automaticTitle}>{AUTOMATIC_PLAN_COPY.title}</div>
      <div className="dbody automatic-plan-body" aria-labelledby={PLANNER_FIELD_IDS.automaticTitle}>
        <p className="automatic-plan-subtitle">{AUTOMATIC_PLAN_COPY.subtitle}</p>
        <section className="automatic-plan-capacity">
          <strong>{AUTOMATIC_PLAN_COPY.capacityHeading}</strong>
          <div
            className="automatic-plan-capacity-track"
            role="img"
            aria-label={AUTOMATIC_PLAN_COPY.capacityAriaLabel}
          >
            <span className="automatic-plan-capacity-existing" style={{ width: `${existingPercent}%` }} />
            <span className="automatic-plan-capacity-suggested" style={{ width: `${suggestedPercent}%` }} />
          </div>
          <div className="automatic-plan-capacity-legend">
            <span>{AUTOMATIC_PLAN_COPY.existingCapacityLabel}: {AUTOMATIC_PLAN_COPY.durationLabel(preview.existingPlannedMinutes)}</span>
            <span>{AUTOMATIC_PLAN_COPY.suggestedCapacityLabel}: {AUTOMATIC_PLAN_COPY.durationLabel(preview.suggestedMinutes)}</span>
            <span>{AUTOMATIC_PLAN_COPY.openCapacityLabel}: {AUTOMATIC_PLAN_COPY.durationLabel(openMinutes)}</span>
          </div>
        </section>
        <section className="automatic-plan-section">
          <h4>{AUTOMATIC_PLAN_COPY.suggestionsHeading}</h4>
          {suggestions.length ? (
            <div className="automatic-plan-suggestions">
              {suggestions.map((suggestion) => {
                const task = tasks.get(suggestion.taskId);
                const list = task ? lists.get(task.listId) : null;
                return (
                  <div className="automatic-plan-suggestion" key={`${suggestion.taskId}:${suggestion.start}`}>
                    <CalendarClock size={PLANNER_ICON_SIZE} />
                    <span>
                      <strong>{task?.name || AUTOMATIC_PLAN_COPY.unknownTask}</strong>
                      <small>{AUTOMATIC_PLAN_COPY.suggestionMeta(
                        list?.name || AUTOMATIC_PLAN_COPY.unknownList,
                        sessionRangeLabel(suggestion.start!, suggestion.end!),
                      )}</small>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : <p className="automatic-plan-empty">{AUTOMATIC_PLAN_COPY.emptySuggestions}</p>}
        </section>
        <section className="automatic-plan-section automatic-plan-remainders">
          <h4>{AUTOMATIC_PLAN_COPY.remainderHeading}</h4>
          {preview.remainders.length ? preview.remainders.map((remainder) => {
            const task = tasks.get(remainder.taskId);
            const deadline = remainder.deadlineAt == null
              ? undefined
              : new Date(remainder.deadlineAt).toLocaleDateString(undefined, AUTOMATIC_PLAN_DATE_FORMAT);
            return (
              <p key={remainder.taskId}>
                <strong>{task?.name || AUTOMATIC_PLAN_COPY.unknownTask}</strong>
                <span>{AUTOMATIC_PLAN_COPY.remainderMessage(
                  AUTOMATIC_PLAN_COPY.durationLabel(remainder.remainingMinutes),
                  deadline,
                )}</span>
              </p>
            );
          }) : <p className="automatic-plan-empty">{AUTOMATIC_PLAN_COPY.noRemainders}</p>}
        </section>
      </div>
      <div className="dfoot">
        <button className="btn" type="button" disabled={busy} onClick={onClose}>{AUTOMATIC_PLAN_COPY.closeButton}</button>
        <button className="btn" type="button" disabled={busy} onClick={onRefresh}>{AUTOMATIC_PLAN_COPY.refreshButton}</button>
        <button className="btn primary" type="button" disabled={busy || !suggestions.length} onClick={onAccept}>
          {busy ? <LoaderCircle className="automatic-plan-spinner" size={PLANNER_ICON_SIZE} /> : null}
          {busy ? AUTOMATIC_PLAN_COPY.acceptingButton : AUTOMATIC_PLAN_COPY.acceptButton}
        </button>
      </div>
    </AnimatedModal>
  );
}
