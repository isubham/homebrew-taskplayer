import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Pencil, Play, Trash2 } from "lucide-react";
import {
  PLANNER_BLOCK_KINDS,
  PLANNER_COPY,
  PLANNER_HOVER_CARD_HEIGHT_PX,
  PLANNER_HOVER_CARD_HIDE_DELAY_MS,
  PLANNER_HOVER_CARD_OFFSET_PX,
  PLANNER_HOVER_CARD_VIEWPORT_GAP_PX,
  PLANNER_HOVER_CARD_WIDTH_PX,
  PLANNER_HOUR_HEIGHT_PX,
  PLANNER_ICON_SIZE,
  PLANNER_MIN_BLOCK_HEIGHT_PX,
  PLANNER_MINUTES_PER_HOUR,
} from "../../constants";
import type { PlannerBlock as PlannerBlockModel } from "../../planner/planner-model";
import { plannerMinuteInDay, plannerTimeLabel } from "../../planner/planner-time";
import { fmtLong } from "../../utils";

type PlannerBlockProps = {
  block: PlannerBlockModel;
  dayStart: number;
  onEdit: (id: string) => void;
  onEditActual: (id: string) => void;
  onOpenReference: (listId: string, taskId?: string) => void;
  onStart: (id: string) => void;
  onDelete: (id: string) => void;
};

const kindLabel = (kind: PlannerBlockModel["kind"]) => {
  if (kind === PLANNER_BLOCK_KINDS.actual) return PLANNER_COPY.actualLabel;
  if (kind === PLANNER_BLOCK_KINDS.break) return PLANNER_COPY.breakLabel;
  if (kind === PLANNER_BLOCK_KINDS.live) return PLANNER_COPY.liveLabel;
  if (kind === PLANNER_BLOCK_KINDS.routine) return PLANNER_COPY.routineLabel;
  if (kind === PLANNER_BLOCK_KINDS.availability) return PLANNER_COPY.availabilityLabel;
  return PLANNER_COPY.plannedLabel;
};

export function PlannerBlock({ block, dayStart, onEdit, onEditActual, onOpenReference, onStart, onDelete }: PlannerBlockProps) {
  const startMinute = plannerMinuteInDay(block.start, dayStart);
  const endMinute = plannerMinuteInDay(block.end, dayStart, true);
  const top = startMinute * PLANNER_HOUR_HEIGHT_PX / PLANNER_MINUTES_PER_HOUR;
  const naturalHeight = (endMinute - startMinute) * PLANNER_HOUR_HEIGHT_PX / PLANNER_MINUTES_PER_HOUR;
  const height = Math.max(PLANNER_MIN_BLOCK_HEIGHT_PX, naturalHeight);
  const planned = block.kind === PLANNER_BLOCK_KINDS.planned;
  const actual = block.kind === PLANNER_BLOCK_KINDS.actual;
  const sessionBreak = block.kind === PLANNER_BLOCK_KINDS.break;
  const dragBlocking = planned || actual || sessionBreak || block.kind === PLANNER_BLOCK_KINDS.live;
  const range = PLANNER_COPY.timeRangeLabel(plannerTimeLabel(block.start), plannerTimeLabel(block.end));
  const referenceTitle = block.kind === PLANNER_BLOCK_KINDS.availability && block.detail
    ? block.detail
    : block.label;
  const title = actual
    ? PLANNER_COPY.editRecordedSessionTitle(block.label, range)
    : PLANNER_COPY.blockTitle(block.label, range);
  const style = {
    "--planner-block-top": `${top}px`,
    "--planner-block-height": `${height}px`,
    "--planner-block-color": block.color,
  } as React.CSSProperties;
  const [hoverPosition, setHoverPosition] = useState<{ left: number; top: number } | null>(null);
  const hideTimer = useRef<number | null>(null);
  const clearHide = () => {
    if (hideTimer.current == null) return;
    window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  const showHoverCard = (event: React.PointerEvent<HTMLElement>) => {
    clearHide();
    const gap = PLANNER_HOVER_CARD_VIEWPORT_GAP_PX;
    const left = Math.max(gap, Math.min(
      event.clientX + PLANNER_HOVER_CARD_OFFSET_PX,
      window.innerWidth - PLANNER_HOVER_CARD_WIDTH_PX - gap,
    ));
    const below = event.clientY + PLANNER_HOVER_CARD_OFFSET_PX;
    const top = below + PLANNER_HOVER_CARD_HEIGHT_PX + gap <= window.innerHeight
      ? below
      : Math.max(gap, event.clientY - PLANNER_HOVER_CARD_HEIGHT_PX - PLANNER_HOVER_CARD_OFFSET_PX);
    setHoverPosition({ left, top });
  };
  const hideHoverCard = () => {
    clearHide();
    hideTimer.current = window.setTimeout(() => setHoverPosition(null), PLANNER_HOVER_CARD_HIDE_DELAY_MS);
  };
  useEffect(() => () => clearHide(), []);

  return (
    <>
      <article
        className={`planner-block planner-block-${block.kind}`}
        style={style}
        aria-label={actual ? title : undefined}
        role={actual ? "button" : undefined}
        tabIndex={actual ? 0 : undefined}
        data-planner-drag-blocking={dragBlocking ? "" : undefined}
        onPointerEnter={showHoverCard}
        onPointerLeave={hideHoverCard}
        onClick={planned ? () => onEdit(block.id) : actual ? () => onEditActual(block.id) : undefined}
        onKeyDown={actual ? (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onEditActual(block.id);
        } : undefined}
      >
        <div className="planner-block-copy">
          <strong>{block.label}</strong>
          <span>{range}</span>
          <small>{kindLabel(block.kind)}{block.detail ? <> · {block.detail}</> : null}</small>
        </div>
        {planned ? (
          <div className="planner-block-actions">
            <button title={PLANNER_COPY.startButton} aria-label={PLANNER_COPY.startButton} onClick={(event) => { event.stopPropagation(); onStart(block.id); }}><Play size={PLANNER_ICON_SIZE} /></button>
            <button title={PLANNER_COPY.editButton} aria-label={PLANNER_COPY.editButton} onClick={(event) => { event.stopPropagation(); onEdit(block.id); }}><Pencil size={PLANNER_ICON_SIZE} /></button>
            <button title={PLANNER_COPY.deleteButton} aria-label={PLANNER_COPY.deleteButton} onClick={(event) => { event.stopPropagation(); onDelete(block.id); }}><Trash2 size={PLANNER_ICON_SIZE} /></button>
          </div>
        ) : null}
      </article>
      {hoverPosition ? createPortal(
        <div
          className="planner-hover-card"
          role="group"
          aria-label={PLANNER_COPY.hoverCardLabel}
          style={{ left: hoverPosition.left, top: hoverPosition.top, width: PLANNER_HOVER_CARD_WIDTH_PX }}
          onPointerEnter={clearHide}
          onPointerLeave={hideHoverCard}
        >
          {block.listId ? (
            <button type="button" aria-label={PLANNER_COPY.openReferenceLabel(referenceTitle)} onClick={() => onOpenReference(block.listId!, block.taskId)}>
              <span>{referenceTitle}</span><ArrowUpRight size={PLANNER_ICON_SIZE} />
            </button>
          ) : <strong>{referenceTitle}</strong>}
          <span>{range}</span>
          {block.sessionFocusMs != null && block.sessionBreakMs != null ? (
            <span>{PLANNER_COPY.actualLabel} {fmtLong(block.sessionFocusMs)} · {PLANNER_COPY.breakLabel} {fmtLong(block.sessionBreakMs)}</span>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
