import React, { useRef, useState } from "react";
import {
  PLANNER_BLOCK_KINDS,
  PLANNER_COPY,
  PLANNER_DRAG_BLOCKING_SELECTOR,
  PLANNER_DRAG_THRESHOLD_PX,
  PLANNER_HOUR_HEIGHT_PX,
  PLANNER_MINUTES_PER_DAY,
  PLANNER_MINUTES_PER_HOUR,
  PLANNER_PRIMARY_POINTER_BUTTON,
  PLANNER_TIME_STEP_MILLISECONDS,
  PLANNER_TIME_STEP_MINUTES,
} from "../constants";
import { plannerTimestampAtMinute } from "./planner-time";

export type PlannerDragSelection = {
  kind: typeof PLANNER_BLOCK_KINDS.actual | typeof PLANNER_BLOCK_KINDS.planned;
  anchorDay: number;
  range: { start: number; end: number };
};

type DragState = { pointerId: number; anchorMinute: number; startY: number; moved: boolean };
type Preview = { startMinute: number; endMinute: number; kind: PlannerDragSelection["kind"] };

const minuteRange = (anchor: number, current: number) => {
  let startMinute = Math.min(anchor, current);
  let endMinute = Math.max(anchor, current);
  if (startMinute === endMinute) {
    if (endMinute < PLANNER_MINUTES_PER_DAY) endMinute += PLANNER_TIME_STEP_MINUTES;
    else startMinute -= PLANNER_TIME_STEP_MINUTES;
  }
  return { startMinute, endMinute };
};

export function usePlannerDragSelection(
  dayStart: number,
  now: number,
  onSelect: (selection: PlannerDragSelection) => void,
) {
  const drag = useRef<DragState | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const minuteAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const raw = (event.clientY - rect.top) / PLANNER_HOUR_HEIGHT_PX * PLANNER_MINUTES_PER_HOUR;
    return Math.max(0, Math.min(PLANNER_MINUTES_PER_DAY,
      Math.round(raw / PLANNER_TIME_STEP_MINUTES) * PLANNER_TIME_STEP_MINUTES));
  };
  const kindFor = (anchorMinute: number, range: ReturnType<typeof minuteRange>, currentNow: number) => {
    const start = plannerTimestampAtMinute(dayStart, range.startMinute);
    const end = plannerTimestampAtMinute(dayStart, range.endMinute);
    if (end <= currentNow) return PLANNER_BLOCK_KINDS.actual;
    if (start >= currentNow) return PLANNER_BLOCK_KINDS.planned;
    return plannerTimestampAtMinute(dayStart, anchorMinute) < currentNow
      ? PLANNER_BLOCK_KINDS.actual
      : PLANNER_BLOCK_KINDS.planned;
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.moved ||= Math.abs(event.clientY - current.startY) >= PLANNER_DRAG_THRESHOLD_PX;
    if (!current.moved) return;
    const range = minuteRange(current.anchorMinute, minuteAt(event));
    setPreview({ ...range, kind: kindFor(current.anchorMinute, range, now) });
  };
  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    drag.current = null;
    setPreview(null);
    if (!current || current.pointerId !== event.pointerId || !current.moved) return;
    const minutes = minuteRange(current.anchorMinute, minuteAt(event));
    const currentNow = Date.now();
    const kind = kindFor(current.anchorMinute, minutes, currentNow);
    let start = plannerTimestampAtMinute(dayStart, minutes.startMinute);
    let end = plannerTimestampAtMinute(dayStart, minutes.endMinute);
    if (start < currentNow && end > currentNow) {
      if (kind === PLANNER_BLOCK_KINDS.actual) end = currentNow;
      else start = currentNow;
    }
    if (end - start < PLANNER_TIME_STEP_MILLISECONDS) {
      if (kind === PLANNER_BLOCK_KINDS.actual) start = Math.max(dayStart, end - PLANNER_TIME_STEP_MILLISECONDS);
      else end = Math.min(plannerTimestampAtMinute(dayStart, PLANNER_MINUTES_PER_DAY), start + PLANNER_TIME_STEP_MILLISECONDS);
    }
    if (end > start) onSelect({ kind, anchorDay: dayStart, range: { start, end } });
  };

  const handlers = {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== PLANNER_PRIMARY_POINTER_BUTTON || (event.target as Element).closest(PLANNER_DRAG_BLOCKING_SELECTOR)) return;
      const anchorMinute = minuteAt(event);
      drag.current = { pointerId: event.pointerId, anchorMinute, startY: event.clientY, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: move,
    onPointerUp: finish,
    onPointerCancel: () => { drag.current = null; setPreview(null); },
  };
  const previewStyle = preview ? {
    top: `${preview.startMinute / PLANNER_MINUTES_PER_HOUR * PLANNER_HOUR_HEIGHT_PX}px`,
    height: `${(preview.endMinute - preview.startMinute) / PLANNER_MINUTES_PER_HOUR * PLANNER_HOUR_HEIGHT_PX}px`,
  } : undefined;
  const previewLabel = preview?.kind === PLANNER_BLOCK_KINDS.actual
    ? PLANNER_COPY.dragRecordLabel
    : PLANNER_COPY.dragPlanLabel;
  return { handlers, preview, previewStyle, previewLabel };
}
