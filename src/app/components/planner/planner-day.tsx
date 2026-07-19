import React from "react";
import { History, Plus } from "lucide-react";
import {
  PLANNER_COPY,
  PLANNER_GRID_LINE_COUNT,
  PLANNER_HOUR_HEIGHT_PX,
  PLANNER_HOURS_PER_DAY,
  PLANNER_ICON_SIZE,
  PLANNER_MINUTES_PER_HOUR,
} from "../../constants";
import type { PlannerDay as PlannerDayModel } from "../../planner/planner-model";
import { usePlannerDragSelection, type PlannerDragSelection } from "../../planner/use-planner-drag-selection";
import { PlannerBlock } from "./planner-block";

type PlannerDayProps = {
  day: PlannerDayModel;
  now: number;
  onAdd: (dayStart: number) => void;
  onRecord: (dayStart: number) => void;
  onSelectRange: (selection: PlannerDragSelection) => void;
  onEdit: (id: string) => void;
  onEditActual: (id: string) => void;
  onOpenReference: (listId: string, taskId?: string) => void;
  onStart: (id: string) => void;
  onDelete: (id: string) => void;
};

export function PlannerDay({ day, now, onAdd, onRecord, onSelectRange, onEdit, onEditActual, onOpenReference, onStart, onDelete }: PlannerDayProps) {
  const nowDate = new Date(now);
  const nowTop = day.isToday
    ? (nowDate.getHours() + nowDate.getMinutes() / PLANNER_MINUTES_PER_HOUR) * PLANNER_HOUR_HEIGHT_PX
    : null;
  const dragSelection = usePlannerDragSelection(day.start, now, onSelectRange);

  return (
    <section className={`planner-day${day.isToday ? " is-today" : ""}`}>
      <header className="planner-day-header">
        <div>
          <strong>{day.heading}</strong>
          {day.isToday ? <span>{PLANNER_COPY.todayHeading}</span> : null}
        </div>
        <div className="planner-day-actions">
          {day.start < now ? (
            <button title={PLANNER_COPY.recordButton} aria-label={PLANNER_COPY.recordButton} onClick={() => onRecord(day.start)}>
              <History size={PLANNER_ICON_SIZE} />
            </button>
          ) : null}
          {day.end > now ? (
            <button title={PLANNER_COPY.addButton} aria-label={PLANNER_COPY.addButton} onClick={() => onAdd(day.start)}>
              <Plus size={PLANNER_ICON_SIZE} />
            </button>
          ) : null}
        </div>
        <div className="planner-deadlines">
          {day.deadlines.map((deadline) => (
            <span key={deadline.taskId} style={{ "--planner-deadline-color": deadline.color } as React.CSSProperties}>
              {PLANNER_COPY.deadlineLabel(deadline.label)}
            </span>
          ))}
        </div>
      </header>
      <div className="planner-day-grid" {...dragSelection.handlers}>
        {Array.from({ length: PLANNER_GRID_LINE_COUNT }, (_, hour) => (
          <i key={hour} className="planner-grid-line" style={{ top: `${hour / PLANNER_HOURS_PER_DAY * 100}%` }} />
        ))}
        {day.blocks.map((block) => (
          <PlannerBlock key={`${block.id}:${day.start}`} block={block} dayStart={day.start} onEdit={onEdit} onEditActual={onEditActual} onOpenReference={onOpenReference} onStart={onStart} onDelete={onDelete} />
        ))}
        {dragSelection.preview ? (
          <div className={`planner-drag-selection planner-drag-${dragSelection.preview.kind}`} style={dragSelection.previewStyle}>
            {dragSelection.previewLabel}
          </div>
        ) : null}
        {nowTop != null ? <i className="planner-now-line" style={{ top: `${nowTop}px` }} /> : null}
      </div>
    </section>
  );
}
