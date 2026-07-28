import { CalendarDays } from "lucide-react";
import type { CSSProperties } from "react";
import {
  ADAPTIVE_AREA_COPY,
  HEALTH_UPCOMING_KINDS,
  TASK_ROW_CONTEXTS,
} from "../constants";
import { LIFE_AREAS } from "../utils";
import { LifeAreaIcon } from "./life-area-icon";
import { StickyHeader } from "./sticky-header";
import { TaskRow, TaskTableHead } from "./task-row";

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function AdaptiveAreaShell({ areaKey, subtitle, children }) {
  const area = LIFE_AREAS.find((candidate) => candidate.key === areaKey);
  if (!area) return null;
  return (
    <div className="health-area-page" style={{ "--health-area-color": area.color } as CSSProperties}>
      <StickyHeader icon={<LifeAreaIcon areaKey={area.key} />} name={area.label} />
      <div className="hdr health-area-hero" data-tauri-drag-region>
        <div className="cover"><LifeAreaIcon areaKey={area.key} /></div>
        <div className="info"><small>{subtitle}</small><h1>{area.label}</h1></div>
      </div>
      {children}
    </div>
  );
}

export function AdaptiveTaskSection({ heading, entries, emptyCopy, countCopy, state, helpers, attentionTaskIds, spotlight = false }) {
  return (
    <section className={spotlight ? "health-current-focus" : "health-section"}>
      <div className="health-section-heading"><h2>{heading}</h2><span>{countCopy(entries.length)}</span></div>
      {entries.length ? (
        <table className="albrows health-task-rows">
          <TaskTableHead />
          <tbody>{entries.map((entry, index) => (
            <TaskRow
              key={entry.task.id}
              state={state}
              task={entry.task}
              listItem={entry.listItem}
              index={index}
              taskSessions={helpers.taskSessions}
              taskTotal={helpers.taskTotal}
              attentionTaskIds={attentionTaskIds}
              context={TASK_ROW_CONTEXTS.lifeArea}
              isDragDisabled
            />
          ))}</tbody>
        </table>
      ) : <div className="health-empty-inline">{emptyCopy}</div>}
    </section>
  );
}

export function AdaptiveUpcoming({ heading, items, emptyCopy, onOpenTask }) {
  return (
    <section className="health-section health-upcoming">
      <div className="health-section-heading"><h2>{heading}</h2><CalendarDays size={16} aria-hidden="true" /></div>
      {items.length ? items.map((item) => (
        <button key={`${item.kind}:${item.task.id}:${item.at}`} type="button" className="health-upcoming-row" onClick={() => onOpenTask(item.task.id)}>
          <span className="health-upcoming-date">{DATE_FORMAT.format(item.at)}</span>
          <span className="health-upcoming-copy">
            <strong>{item.task.name}</strong>
            <small>
              {item.kind === HEALTH_UPCOMING_KINDS.planned
                ? `${ADAPTIVE_AREA_COPY.plannedLabel} · ${TIME_FORMAT.format(item.at)}`
                : ADAPTIVE_AREA_COPY.deadlineLabel}
              {" · "}{item.listItem.name}
            </small>
          </span>
        </button>
      )) : <div className="health-empty-inline">{emptyCopy}</div>}
    </section>
  );
}

export function AdaptiveShowAll({ shown, total, limit, onClick }) {
  if (total <= limit) return null;
  return (
    <button type="button" className="health-show-all" onClick={onClick}>
      {shown ? ADAPTIVE_AREA_COPY.showLess : ADAPTIVE_AREA_COPY.viewAll(total)}
    </button>
  );
}
