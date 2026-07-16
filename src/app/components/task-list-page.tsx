import React from "react";
import _ from "lodash";
import { albumColor, fmtHM, fmtLong, fmtEst, LIFE_AREAS } from "../utils.jsx";
import { groupWeeklyWindows } from "../weekly-schedule.jsx";
import { StickyHeader } from "./sticky-header.jsx";
import { TaskRow, TaskTableHead } from "./task-row.jsx";
import { useApp } from "../context/AppContext.jsx";
import { TASK_REPEAT_COPY } from "../constants.jsx";
import { Droppable } from "@hello-pangea/dnd";

const withEstimate = (timeText, estimateMin) => estimateMin ? `${timeText} of ${fmtEst(estimateMin)}` : timeText;

const TaskTable = ({ tasks, context, className = "albrows", droppableId, isDragDisabled = false }) => {
  if (!droppableId) {
    return (
      <table className={className}>
        <TaskTableHead />
        <tbody>
          {tasks.map((task, index) => (
            <TaskRow key={task.id} {...context} task={task} index={index} isDragDisabled={true} />
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <table className={className}>
      <TaskTableHead />
      <Droppable droppableId={droppableId} type="task" isDropDisabled={isDragDisabled}>
        {(provided, snapshot) => (
          <tbody
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={snapshot.isDraggingOver ? "drop-zone-over" : ""}
          >
            {tasks.map((task, index) => (
              <TaskRow key={task.id} {...context} task={task} index={index} isDragDisabled={isDragDisabled} />
            ))}
            {provided.placeholder}
          </tbody>
        )}
      </Droppable>
    </table>
  );
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const clockLabel = (minutes) => {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return `${hour}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${suffix}`;
};

const dayRangeLabel = (weekdays = []) => {
  const ordered = [...new Set(weekdays.map(Number))].sort((a, b) => a - b);
  if (ordered.length === 7) return "Every day";
  if (!ordered.length) return "No days";
  const contiguous = ordered.every((day, index) => index === 0 || day === ordered[index - 1] + 1);
  if (contiguous && ordered.length >= 3) return `${DAY_LABELS[ordered[0] - 1]}–${DAY_LABELS[ordered[ordered.length - 1] - 1]}`;
  return ordered.map((day) => DAY_LABELS[day - 1]).join(", ");
};

const availabilityLabel = (windows = []) => {
  if (!windows.length) return "Availability not set";
  const grouped = groupWeeklyWindows(windows);
  const first = grouped[0];
  const overnight = first.endMinute < first.startMinute ? " · next day" : "";
  const summary = `${dayRangeLabel(first.weekdays)} · ${clockLabel(first.startMinute)}–${clockLabel(first.endMinute)}${overnight}`;
  return grouped.length > 1 ? `${summary} · +${grouped.length - 1} window${grouped.length === 2 ? "" : "s"}` : summary;
};

export function TaskListPage({ state, listItem, all, taskSessions, taskTotal, listTotal, listEstimateTotal, attentionTaskIds }) {
  const { actions } = useApp();
  const todo = all.filter((task) => !task.completedAt);
  const dailyTodo = todo.filter((task) => task.cadence === "daily");
  const oneTimeTodo = todo.filter((task) => task.cadence !== "daily");
  const done = all.filter((task) => task.completedAt).sort((a, b) => b.completedAt - a.completedAt);
  const rowContext = { state, listItem, taskSessions, taskTotal, attentionTaskIds };
  const trackedMs = listTotal(listItem.id);
  const estimateMin = listEstimateTotal(listItem.id);
  const progressPct = estimateMin ? Math.min(100, (trackedMs / (estimateMin * 60_000)) * 100) : 0;

  const lifeArea = LIFE_AREAS.find((area) => area.key === listItem.lifeArea);
  const areaName = lifeArea?.key === "career" ? "Career" : lifeArea?.label;
  const areaLabel = lifeArea ? `${listItem.lifeDirection === "decrease" ? "↓" : "↑"} ${areaName}` : "Unsorted";

  const byAlbum = _.groupBy(oneTimeTodo, (task) => task.album || "");
  const albumOrder = _.uniq(_.map(oneTimeTodo, (task) => task.album || ""));
  const singles = byAlbum[""] || [];
  const albums = _.filter(albumOrder, Boolean);

  const albumSections = albums.map((name) => {
    const tasks = byAlbum[name] || [];
    const totalMs = tasks.reduce((sum, t) => sum + taskTotal(t.id), 0);
    const totalEstimate = tasks.reduce((sum, t) => sum + (t.estimateMin || 0), 0);
    const color = albumColor(name);
    return (
      <React.Fragment key={name}>
        <div className="albhead">
          <div className="alb-tile" style={{ background: `${color}22`, color: color }}>💿</div>
          <div className="alb-meta">
            <div className="alb-name">{name}</div>
            <div className="alb-sub">{tasks.length} task{tasks.length === 1 ? "" : "s"} · {withEstimate(fmtLong(totalMs), totalEstimate)}</div>
          </div>
          <button
            className="alb-play"
            onClick={(e) => {
              e.stopPropagation();
              actions.play(tasks[0].id);
            }}
            title="Play first task in this album"
          >
            ▶
          </button>
        </div>
        <TaskTable tasks={tasks} context={rowContext} droppableId={name} />
      </React.Fragment>
    );
  });

  const singlesSection = albums.length ? (
    <React.Fragment key="singles">
      <div className="singles-tag">
        Singles
      </div>
      <TaskTable tasks={singles} context={rowContext} droppableId="singles" />
    </React.Fragment>
  ) : singles.length ? (
    <TaskTable key="singles-no-albums" tasks={singles} context={rowContext} droppableId="singles" />
  ) : null;

  return (
    <>
      <StickyHeader icon={listItem.emoji} name={listItem.name} />
      <div className="hdr list-hero" data-tauri-drag-region>
        <button
          className="list-edit-action"
          onClick={() => actions.editList(listItem.id)}
          title="Edit list"
          aria-label="Edit list"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
          </svg>
        </button>
        <div className="cover list-cover" style={{ background: `linear-gradient(135deg,${listItem.color},${listItem.color}55)` }}>
          <span>{listItem.emoji}</span>
          <span className="cover-equalizer" aria-hidden="true"><i /><i /><i /><i /></span>
        </div>
        <div className="info list-hero-info">
          <small>Playlist</small>
          <h1>{listItem.name}</h1>
          <div className="sub">{todo.length} track{todo.length === 1 ? "" : "s"}{done.length ? ` · ${done.length} completed` : ""} · {fmtLong(trackedMs)} recorded</div>
          <div className="list-liner">
            <span className="list-area" style={lifeArea ? { color: lifeArea.color } : undefined}>{areaLabel}</span>
            <span className="list-availability">{availabilityLabel(listItem.availabilityWindows || [])}</span>
            {estimateMin ? (
              <span className="list-progress-track" aria-label={`${fmtLong(trackedMs)} of ${fmtEst(estimateMin)} recorded`}>
                <span style={{ width: `${progressPct}%`, backgroundColor: listItem.color }} />
              </span>
            ) : null}
            <span className="list-progress-time">{withEstimate(fmtLong(trackedMs), estimateMin)}</span>
          </div>
        </div>
      </div>
      <div className="list-action-row">
        <button className="pill list-add-task" onClick={actions.addTask}>＋ Add task</button>
      </div>
      {todo.length ? (
        <>
          <div className="task-kind-label">{TASK_REPEAT_COPY.sectionLabel} <span>· {dailyTodo.length}</span></div>
          {dailyTodo.length ? (
            <TaskTable tasks={dailyTodo} context={rowContext} className="albrows task-kind-rows" isDragDisabled={true} />
          ) : (
            <div className="task-kind-empty">{TASK_REPEAT_COPY.emptySection}</div>
          )}
          <div className="task-kind-label one-time">One-time <span>· {oneTimeTodo.length}</span></div>
          {oneTimeTodo.length ? (
            <>
              {albumSections}
              {singlesSection}
            </>
          ) : (
            <div className="task-kind-empty">No one-time tasks in this list.</div>
          )}
        </>
      ) : (
        <div className="empty">
          {all.length ? "All done here. 🎉" : <>No tasks yet. Click <b>Add task</b> to start.</>}
        </div>
      )}
      {done.length ? (
        <div className={`cgroup ${state.completedOpen ? "open" : ""}`}>
          <div className="chead" onClick={() => { actions.closeRowMenu(); actions.setCompletedOpen(!state.completedOpen); }}>
            <span className="chev">›</span> Completed · {done.length}
          </div>
          <div className="clist">
            {done.map((task) => (
              <div key={task.id} className="crow" onClick={() => actions.setOpenTaskId(task.id)} style={{ cursor: "pointer" }}>
                <button
                  className="ccheck"
                  title="Mark as not done"
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.toggleDone(task.id);
                  }}
                >
                  ✓
                </button>
                <span className="cname">{task.name}</span>
                <span className="ctime">{fmtHM(taskTotal(task.id))}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <p className="note">Only one task runs at a time. The menu-bar item shows live minutes and toggles play/pause.</p>
    </>
  );
}
