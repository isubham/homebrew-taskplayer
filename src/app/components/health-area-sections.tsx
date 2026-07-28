import { CalendarDays, ChevronRight } from "lucide-react";
import { HEALTH_AREA_COPY, HEALTH_UPCOMING_KINDS, TASK_CADENCE_DAILY, TASK_ROW_CONTEXTS } from "../constants";
import { isTaskTerminallyCompleted } from "../utils";
import { TaskRow, TaskTableHead } from "./task-row";

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function HealthTaskSection({ heading, entries, emptyCopy, countCopy = HEALTH_AREA_COPY.taskCount, state, helpers, attentionTaskIds }) {
  return (
    <section className="health-section">
      <div className="health-section-heading">
        <h2>{heading}</h2>
        <span>{countCopy(entries.length)}</span>
      </div>
      {entries.length ? (
        <table className="albrows health-task-rows">
          <TaskTableHead />
          <tbody>
            {entries.map((entry, index) => (
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
            ))}
          </tbody>
        </table>
      ) : <div className="health-empty-inline">{emptyCopy}</div>}
    </section>
  );
}

export function HealthCollections({ lists, tasks, nextActions, onOpen }) {
  return (
    <section className="health-section">
      <div className="health-section-heading">
        <h2>{HEALTH_AREA_COPY.collectionsHeading}</h2>
        <span>{lists.length}</span>
      </div>
      <div className="health-collection-grid">
        {lists.map((listItem) => {
          const listTasks = tasks.filter((task) => task.listId === listItem.id);
          const oneTime = listTasks.filter((task) => task.cadence !== TASK_CADENCE_DAILY);
          const completed = oneTime.filter(isTaskTerminallyCompleted).length;
          const routines = listTasks.filter((task) => task.cadence === TASK_CADENCE_DAILY).length;
          const next = nextActions.find((entry) => entry.listItem.id === listItem.id)?.task;
          const progress = oneTime.length ? Math.round((completed / oneTime.length) * 100) : null;
          return (
            <button
              key={listItem.id}
              type="button"
              className="health-collection-card"
              onClick={() => onOpen(listItem.id)}
              aria-label={HEALTH_AREA_COPY.collectionOpenLabel(listItem.name)}
            >
              <span className="health-collection-emoji">{listItem.emoji}</span>
              <span className="health-collection-copy">
                <strong>{listItem.name}</strong>
                <small>
                  {HEALTH_AREA_COPY.actionCount(oneTime.length)}
                  {routines ? ` · ${HEALTH_AREA_COPY.routineCount(routines)}` : ""}
                </small>
                {next ? <span className="health-collection-next">{next.name}</span> : null}
                {progress != null ? (
                  <span className="health-collection-progress" aria-label={`${completed} of ${oneTime.length} actions complete`}>
                    <span style={{ width: `${progress}%` }} />
                  </span>
                ) : null}
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function HealthUpcoming({ items, onOpenTask }) {
  return (
    <section className="health-section health-upcoming">
      <div className="health-section-heading">
        <h2>{HEALTH_AREA_COPY.upcomingHeading}</h2>
        <CalendarDays size={16} aria-hidden="true" />
      </div>
      {items.length ? items.map((item) => (
        <button key={`${item.kind}:${item.task.id}:${item.at}`} type="button" className="health-upcoming-row" onClick={() => onOpenTask(item.task.id)}>
          <span className="health-upcoming-date">{DATE_FORMAT.format(item.at)}</span>
          <span className="health-upcoming-copy">
            <strong>{item.task.name}</strong>
            <small>
              {item.kind === HEALTH_UPCOMING_KINDS.planned ? `${HEALTH_AREA_COPY.plannedLabel} · ${TIME_FORMAT.format(item.at)}` : HEALTH_AREA_COPY.deadlineLabel}
              {" · "}{item.listItem.name}
            </small>
          </span>
        </button>
      )) : <div className="health-empty-inline">{HEALTH_AREA_COPY.emptyUpcoming}</div>}
    </section>
  );
}
