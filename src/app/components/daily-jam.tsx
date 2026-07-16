import React from "react";
import { LIFE_AREAS } from "../utils.jsx";
import { TaskRow, TaskTableHead } from "./task-row.jsx";
import { TASK_REPEAT_COPY, UNTAGGED_LIST_COLOR } from "../constants.jsx";

const getGroups = (state, entries) => {
  const rankByArea = new Map((state.S.lifeAreaPriorities || []).map((item) => [item.areaKey, item.priorityRank]));
  const orderedAreas = LIFE_AREAS.map((area, canonicalIndex) => ({ area, canonicalIndex }))
    .sort((a, b) =>
      (rankByArea.get(a.area.key) ?? a.canonicalIndex + 1) - (rankByArea.get(b.area.key) ?? b.canonicalIndex + 1)
      || a.canonicalIndex - b.canonicalIndex);
  const knownAreas = new Set(LIFE_AREAS.map((area) => area.key));
  const result = orderedAreas.map(({ area }) => ({
    key: area.key,
    label: area.label,
    color: area.color,
    entries: entries.filter((entry) => entry.listItem?.lifeArea === area.key),
  }));
  const unsorted = entries.filter((entry) => !knownAreas.has(entry.listItem?.lifeArea));
  if (unsorted.length) result.push({ key: "unsorted", label: "Unsorted", color: UNTAGGED_LIST_COLOR, entries: unsorted });
  return result;
};

const TaskTable = ({ entries, startIndex, context, withHead = false }) => (
  <table className="albrows daily-jam-rows">
    {withHead ? <TaskTableHead /> : null}
    <tbody>
      {entries.map((entry, index) => (
        <TaskRow
          key={entry.task.id}
          state={context.state}
          task={entry.task}
          listItem={entry.listItem}
          index={startIndex + index}
          taskSessions={context.taskSessions}
          taskTotal={context.taskTotal}
          attentionTaskIds={context.attentionTaskIds}
          context="dailyJam"
        />
      ))}
    </tbody>
  </table>
);

const folderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const Card = ({ group, context }) => {
  const done = group.entries.filter((entry) => entry.doneToday).length;
  const total = group.entries.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const visible = group.entries.slice(0, 4);
  const remaining = group.entries.slice(4);

  return (
    <article className="daily-jam-card" style={{ "--daily-area": group.color }}>
      <header className="daily-jam-card-head">
        <span className="daily-jam-area-icon">{folderIcon()}</span>
        <h5>{group.label}</h5>
        <span className="daily-jam-count">{total ? `${done} of ${total}` : "No tasks"}</span>
      </header>
      <div className="daily-jam-area-bar" aria-label={`${done} of ${total} complete today`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="daily-jam-task-list">
        {visible.length ? (
          <TaskTable entries={visible} startIndex={0} context={context} withHead={true} />
        ) : (
          <div className="daily-jam-card-empty">{TASK_REPEAT_COPY.dailyJamEmpty}</div>
        )}
        {remaining.length ? (
          <details className="daily-jam-more">
            <summary>
              <span className="more-closed">Show {remaining.length} more</span>
              <span className="more-open">Show fewer</span>
            </summary>
            <TaskTable entries={remaining} startIndex={visible.length} context={context} />
          </details>
        ) : null}
      </div>
    </article>
  );
};

export function DailyJam({ state, entries, doneCount, percent, taskSessions, taskTotal, attentionTaskIds }) {
  const context = { state, taskSessions, taskTotal, attentionTaskIds };
  return (
    <>
      <div className="daily-jam-bar" aria-label={`${doneCount} of ${entries.length} complete today`}>
        <div className="daily-jam-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="daily-jam-grid">
        {getGroups(state, entries).map((group) => (
          <Card key={group.key} group={group} context={context} />
        ))}
      </div>
    </>
  );
}

// Backward-compatible export
export const dailyJam = (props) => <DailyJam {...props} />;
