import { ChevronRight } from "lucide-react";
import {
  ADAPTIVE_AREA_COPY,
  RELATIONSHIPS_AREA_COPY,
  TASK_CADENCE_DAILY,
  WORK_AREA_COPY,
} from "../constants";
import { isTaskTerminallyCompleted } from "../utils";

export function RelationshipCollections({ lists, tasks, nextActions, onOpen }) {
  return (
    <CollectionSection heading={RELATIONSHIPS_AREA_COPY.collectionsHeading} count={lists.length}>
      {lists.map((listItem) => {
        const listTasks = tasks.filter((task) => task.listId === listItem.id);
        const actions = listTasks.filter((task) => task.cadence !== TASK_CADENCE_DAILY);
        const routines = listTasks.filter((task) => task.cadence === TASK_CADENCE_DAILY).length;
        const next = nextActions.find((entry) => entry.listItem.id === listItem.id)?.task;
        return (
          <CollectionCard key={listItem.id} listItem={listItem} label={RELATIONSHIPS_AREA_COPY.collectionOpenLabel(listItem.name)} onOpen={onOpen}>
            <small>{RELATIONSHIPS_AREA_COPY.actionCount(actions.length)}{routines ? ` · ${RELATIONSHIPS_AREA_COPY.routineCount(routines)}` : ""}</small>
            {next ? <span className="health-collection-next">{next.name}</span> : null}
          </CollectionCard>
        );
      })}
    </CollectionSection>
  );
}

export function WorkProjects({ lists, tasks, albums = [], onOpen }) {
  return (
    <CollectionSection heading={WORK_AREA_COPY.projectsHeading} count={WORK_AREA_COPY.projectCount(lists.length)}>
      {lists.map((listItem) => {
        const listTasks = tasks.filter((task) => task.listId === listItem.id);
        const actions = listTasks.filter((task) => task.cadence !== TASK_CADENCE_DAILY);
        const open = actions.filter((task) => !isTaskTerminallyCompleted(task)).length;
        const completed = actions.length - open;
        const groupNames = [...new Set([
          ...albums.filter((album) => album.listId === listItem.id).map((album) => album.name),
          ...listTasks.map((task) => task.album).filter(Boolean),
        ])];
        const progress = actions.length ? Math.round((completed / actions.length) * 100) : null;
        return (
          <CollectionCard key={listItem.id} listItem={listItem} label={WORK_AREA_COPY.projectOpenLabel(listItem.name)} onOpen={onOpen}>
            <small>{WORK_AREA_COPY.openCount(open)}{groupNames.length ? ` · ${WORK_AREA_COPY.groupCount(groupNames.length)}` : ""}</small>
            {groupNames.length ? <span className="work-project-groups">{groupNames.slice(0, 2).join(" · ")}</span> : null}
            {progress != null ? (
              <span className="health-collection-progress" aria-label={ADAPTIVE_AREA_COPY.progressLabel(completed, actions.length)}>
                <span style={{ width: `${progress}%` }} />
              </span>
            ) : null}
          </CollectionCard>
        );
      })}
    </CollectionSection>
  );
}

function CollectionSection({ heading, count, children }) {
  return (
    <section className="health-section">
      <div className="health-section-heading"><h2>{heading}</h2><span>{count}</span></div>
      <div className="health-collection-grid">{children}</div>
    </section>
  );
}

function CollectionCard({ listItem, label, onOpen, children }) {
  return (
    <button type="button" className="health-collection-card" onClick={() => onOpen(listItem.id)} aria-label={label}>
      <span className="health-collection-emoji">{listItem.emoji}</span>
      <span className="health-collection-copy"><strong>{listItem.name}</strong>{children}</span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}
