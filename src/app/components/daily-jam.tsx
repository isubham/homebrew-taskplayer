import React from "react";
import { LIFE_AREAS } from "../utils.jsx";
import { TaskRow, TaskTableHead } from "./task-row.jsx";
import { DAILY_JAM_COPY, DAILY_JAM_TASK_LIMIT, TASK_REPEAT_COPY, UNTAGGED_LIST_COLOR } from "../constants.jsx";
import { LifeAreaIcon } from "./life-area-icon";

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
          attentionReason={entry.attentionReason}
          context="dailyJam"
        />
      ))}
    </tbody>
  </table>
);

const Card = ({ group, context }) => {
  const pending = group.entries.filter((entry) => !entry.doneToday || entry.active);
  const dailyEntries = group.entries.filter((entry) => entry.scheduledToday);
  const done = dailyEntries.filter((entry) => entry.doneToday).length;
  const total = dailyEntries.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const visible = pending.slice(0, DAILY_JAM_TASK_LIMIT);

  return (
    <article className="daily-jam-card" style={{ "--daily-area": group.color }}>
      <header className="daily-jam-card-head">
        <span className="daily-jam-area-icon"><LifeAreaIcon areaKey={group.key} /></span>
        <h5>{group.label}</h5>
        <span className="daily-jam-count">{DAILY_JAM_COPY.taskCount(visible.length)}</span>
      </header>
      {total ? (
        <div className="daily-jam-area-bar" aria-label={`${done} of ${total} scheduled tasks complete today`}>
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : <div className="daily-jam-area-bar daily-jam-area-bar-empty" aria-hidden="true" />}
      <div className="daily-jam-task-list">
        {visible.length ? (
          <TaskTable entries={visible} startIndex={0} context={context} withHead={true} />
        ) : (
          <div className="daily-jam-card-empty">{TASK_REPEAT_COPY.dailyJamEmpty}</div>
        )}
      </div>
    </article>
  );
};

export function DailyJam({ state, entries, doneCount, dailyTotal, percent, taskSessions, taskTotal, attentionTaskIds }) {
  const context = { state, taskSessions, taskTotal, attentionTaskIds };
  return (
    <>
      {dailyTotal ? (
        <div className="daily-jam-bar" aria-label={`${doneCount} of ${dailyTotal} scheduled tasks complete today`}>
          <div className="daily-jam-bar-fill" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
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
