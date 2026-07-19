import React, { useEffect, useMemo, useRef } from "react";
import {
  PLANNER_COPY,
  PLANNER_DEFAULT_START_HOUR,
  PLANNER_DAY_MIN_WIDTH_PX,
  PLANNER_HOUR_HEIGHT_PX,
  PLANNER_HOUR_LABEL_INTERVAL,
  PLANNER_HOURS_PER_DAY,
  PLANNER_SCROLL_LEAD_HOURS,
  PLANNER_TIME_RAIL_WIDTH_PX,
} from "../../constants";
import type { PlannerDay as PlannerDayModel } from "../../planner/planner-model";
import { plannerTimeLabel } from "../../planner/planner-time";
import type { PlannerDragSelection } from "../../planner/use-planner-drag-selection";
import { PlannerDay } from "./planner-day";

type PlannerCalendarProps = {
  days: PlannerDayModel[];
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

export function PlannerCalendar({ days, now, onAdd, onRecord, onSelectRange, onEdit, onEditActual, onOpenReference, onStart, onDelete }: PlannerCalendarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const labels = useMemo(() => {
    const day = new Date(days[0]?.start || now);
    return Array.from({ length: PLANNER_HOURS_PER_DAY / PLANNER_HOUR_LABEL_INTERVAL }, (_, index) => {
      const hour = index * PLANNER_HOUR_LABEL_INTERVAL;
      day.setHours(hour, 0, 0, 0);
      return { hour, label: plannerTimeLabel(day.getTime()) };
    });
  }, [days, now]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const focusHour = days.some((day) => day.isToday) ? new Date(now).getHours() : PLANNER_DEFAULT_START_HOUR;
    scroller.scrollTop = Math.max(0, focusHour - PLANNER_SCROLL_LEAD_HOURS) * PLANNER_HOUR_HEIGHT_PX;
  }, [days[0]?.start, days.length]);

  const style = {
    "--planner-hour-height": `${PLANNER_HOUR_HEIGHT_PX}px`,
    "--planner-grid-height": `${PLANNER_HOURS_PER_DAY * PLANNER_HOUR_HEIGHT_PX}px`,
    "--planner-day-count": days.length,
    "--planner-surface-min-width": `${PLANNER_TIME_RAIL_WIDTH_PX + days.length * PLANNER_DAY_MIN_WIDTH_PX}px`,
  } as React.CSSProperties;

  return (
    <div className="planner-calendar-scroll" ref={scrollRef} aria-label={PLANNER_COPY.timeGridLabel} style={style}>
      <div className="planner-calendar-surface">
        <aside className="planner-time-rail" aria-hidden="true">
          <div className="planner-time-header" />
          <div className="planner-time-grid">
            {labels.map(({ hour, label }) => <span key={hour} style={{ top: `${hour * PLANNER_HOUR_HEIGHT_PX}px` }}>{label}</span>)}
          </div>
        </aside>
        <div className="planner-days">
          {days.map((day) => (
            <PlannerDay key={day.start} day={day} now={now} onAdd={onAdd} onRecord={onRecord} onSelectRange={onSelectRange} onEdit={onEdit} onEditActual={onEditActual} onOpenReference={onOpenReference} onStart={onStart} onDelete={onDelete} />
          ))}
        </div>
      </div>
    </div>
  );
}
