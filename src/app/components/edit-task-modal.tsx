import React, { useState, useEffect } from "react";
import { esc, fmt, toDateInputValue, jewelPayout, IMPACT_TIERS, IMPACT_TIER_KEYS, LIFE_AREAS } from "../utils.jsx";
import { useApp } from "../context/AppContext.jsx";
import { DEPTH_ICONS, CADENCE_ICONS, SESSION_COPY, TASK_REPEAT_COPY, TOAST_TASK_SAVED, UNTAGGED_LIST_COLOR } from "../constants.jsx";
import { AnimatedModal } from "./motion-transitions.jsx";
import { WeeklyAvailabilityEditor } from "./weekly-availability-editor.jsx";
import { JewelDots } from "./jewel-dots.jsx";
import { repeatWeekdayLabel } from "../weekly-schedule.jsx";
import { sessionRangeLabel } from "../session-time";

const DETAIL_PENCIL_ICON = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);



export function TaskDetailModal() {
  const { state, helpers, actions } = useApp();
  const task = helpers.findTask(state.openTaskId);
  if (!task) return null;

  const listItem = helpers.list(task.listId) || { id: task.listId, name: "Unsorted", emoji: "•", color: UNTAGGED_LIST_COLOR, lifeArea: null };
  const active = state.S.run.activeTaskId === task.id && state.S.run.phase;
  const working = active && state.S.run.phase === "work" && state.S.run.runningStart;

  const entries = helpers.taskSessions(task.id).map((entry) => ({ id: entry.id, start: entry.start, end: entry.end }));
  if (working) entries.push({ start: state.S.run.runningStart, end: null, live: true });
  entries.sort((a, b) => b.start - a.start);

  const now = Date.now();
  const sessionCount = helpers.taskSessions(task.id).length + (working ? 1 : 0);

  const depthCaption = task.depth === "deep" ? "Long, focused, hard to interrupt."
    : task.depth === "shallow" ? "Quick, low-focus busywork."
    : "Not classified.";

  const repeatDays = repeatWeekdayLabel(task.dailyWindows || []);
  const cadenceCaption = task.cadence === "daily"
    ? repeatDays
      ? `${TASK_REPEAT_COPY.selectedDaysPrefix} ${repeatDays}. ${TASK_REPEAT_COPY.selectedDaysSuffix}`
      : TASK_REPEAT_COPY.everyDayCaption
    : "Finishes once. Its jewel (if tagged) pays on completion.";

  const payout = jewelPayout(task);
  const area = listItem && listItem.lifeArea ? LIFE_AREAS.find((a) => a.key === listItem.lifeArea) : null;
  const earnsLabel = task.cadence === "daily" ? TASK_REPEAT_COPY.rewardTiming : "Earns on completion";

  const [notes, setNotes] = useState("");

  useEffect(() => {
    setNotes(task.description || "");
  }, [task.id, task.description]);

  return (
    <AnimatedModal onClose={() => actions.setOpenTaskId(null)} className="modal task-detail-two-column show" id="modal">
        <div className="top">
          <div className="art" style={{ background: `linear-gradient(135deg,${listItem.color},${listItem.color}55)` }}>{listItem.emoji}</div>
          <div>
            <h2>
              <span
                className="list-link"
                onClick={() => { actions.selectList(listItem.id); actions.setOpenTaskId(null); }}
                title={`Go to ${listItem.name}`}
                style={{ cursor: "pointer" }}
              >
                {task.name}
              </span>{" "}
              <button className="editbtn" title="Rename" onClick={() => actions.renameTask(task.id)}>{DETAIL_PENCIL_ICON}</button>
            </h2>
          </div>
          <button className="close" onClick={() => actions.setOpenTaskId(null)}>×</button>
        </div>
        <div className="body">
          <div className="task-detail-grid">
            <div className="task-detail-column task-detail-primary">
              <h4 className="lyr-h">♪ Notes</h4>
              <textarea
                className="lyrics-inline"
                placeholder="What will finishing this feel like? Add the goal, a note, a link…"
                rows="3"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={(e) => actions.setLyricsInline(task.id, e.target.value)}
              />
              <h4>Effort</h4>
              <span className="depth-seg">
                <button className={task.depth === "deep" ? "sel" : ""} onClick={() => actions.setDepth(task.id, "deep")}>{DEPTH_ICONS.deep}<span>Deep</span></button>
                <button className={task.depth === "shallow" ? "sel" : ""} onClick={() => actions.setDepth(task.id, "shallow")}>{DEPTH_ICONS.shallow}<span>Shallow</span></button>
                <button className={!task.depth ? "sel" : ""} onClick={() => actions.setDepth(task.id, "")}>{DEPTH_ICONS.none}<span>None</span></button>
              </span>
              <div className="depth-hint">{depthCaption}</div>
              <h4>Impact</h4>
              <div className="impact-section">
                <div className="impact-dial">
                  {IMPACT_TIER_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`impact-notch${key === task.impactTier ? " sel" : ""}`}
                      onClick={() => actions.setImpactTier(task.id, key === task.impactTier ? "" : key)}
                    >
                      {IMPACT_TIERS[key].label}
                      <small>{IMPACT_TIERS[key].weight}</small>
                    </button>
                  ))}
                </div>
                {task.impactTier && (
                  <div className="sign-group">
                    <div className="sign-toggle">
                      <button type="button" className={`sign-btn ${task.impactSign !== -1 ? "sel" : ""}`} onClick={() => actions.setImpactSign(task.id, "1")}>For</button>
                      <button type="button" className={`sign-btn ${task.impactSign === -1 ? "sel neg" : ""}`} onClick={() => actions.setImpactSign(task.id, "-1")}>Against</button>
                    </div>
                  </div>
                )}
                {payout ? (
                  <div className="payout-preview">
                    {earnsLabel}: <span className="amt"><JewelDots payout={payout} areaColor={area?.color} /><b>{payout.amount > 0 ? "+" : ""}{payout.amount}</b>{area ? " " + area.label : ""}</span>
                  </div>
                ) : (
                  <div className="payout-preview muted">Pick a tier to start earning jewels for this task.</div>
                )}
              </div>

              <h4>List</h4>
              <div className="list-select-wrap">
                <select className="list-select" value={task.listId} onChange={(e) => actions.moveTaskInline(task.id, e.target.value)}>
                  {state.S.lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.emoji} {l.name}</option>
                  ))}
                </select>
                <svg className="list-select-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>
            <div className="task-detail-column task-detail-sessions">
              <h4>Repeat</h4>
              <span className="depth-seg cadence-seg">
                <button className={!task.cadence ? "sel" : ""} onClick={() => actions.setCadence(task.id, "")}>{CADENCE_ICONS.once}<span>One-time</span></button>
                <button className={task.cadence === "daily" ? "sel" : ""} onClick={() => actions.setCadence(task.id, "daily")}>{CADENCE_ICONS.daily}<span>{TASK_REPEAT_COPY.optionLabel}</span></button>
              </span>
              <div className="depth-hint">{cadenceCaption}</div>

              {task.cadence === "daily" ? (
                <>
                  <h4>{TASK_REPEAT_COPY.scheduleHeading}</h4>
                  <div className="detail-weekly-editor">
                    <WeeklyAvailabilityEditor
                      id={`taskDailyWindows-${task.id}`}
                      initialWindows={task.dailyWindows || []}
                      onSave={(windows) => actions.setDailySchedule(task.id, windows)}
                      requireWeekday
                      daysAriaLabel={TASK_REPEAT_COPY.scheduleDaysAriaLabel}
                      emptyMeansEveryDay
                      everyDayLabel={TASK_REPEAT_COPY.everyDayOption}
                    />
                  </div>
                  <div className="depth-hint">{TASK_REPEAT_COPY.scheduleHint}</div>
                </>
              ) : (
                <>
                  <h4>Deadline</h4>
                  <input
                    className="deadline-input"
                    type="date"
                    value={task.deadlineAt ? toDateInputValue(task.deadlineAt) : ""}
                    onChange={(e) => actions.setDeadlineInline(task.id, e.target.value)}
                  />
                  <h4>Session size</h4>
                  <div className="session-range-row">
                    <label><span>Shortest</span><input type="number" min="1" max="1440" placeholder="—" value={task.minSessionMin || ""} onChange={(e) => actions.setSessionRangeField(task.id, "min", e.target.value)} /> min</label>
                    <span className="range-sep">to</span>
                    <label><span>Longest</span><input type="number" min="1" max="1440" placeholder="—" value={task.maxSessionMin || ""} onChange={(e) => actions.setSessionRangeField(task.id, "max", e.target.value)} /> min</label>
                  </div>
                  <div className="depth-hint">The planner splits this task into blocks inside this range.</div>
                </>
              )}

              <div className="sh">
                <h4>Sessions</h4>
                <button className="linkbtn blue" onClick={() => actions.addSession(task.id)}>＋ Add session</button>
              </div>

              {task.cadence === "daily" ? (
                <div className="det-total">{fmt(helpers.taskTotal(task.id))} <span className="dot">· </span>{sessionCount} session{sessionCount === 1 ? "" : "s"}</div>
              ) : (
                <div className="det-total">
                  {fmt(helpers.taskTotal(task.id))} <span className="of">of</span>
                  <button className="est-step" onClick={() => actions.decreaseEstimate(task.id)} title="Decrease estimate by 1h">−</button>
                  <input
                    className="est-inline"
                    type="number"
                    min="0"
                    max="1000"
                    step="0.25"
                    placeholder="—"
                    value={task.estimateMin ? parseFloat((task.estimateMin / 60).toFixed(2)) : ""}
                    onChange={(e) => actions.setEstimateInline(task.id, e.target.value)}
                  />
                  <button className="est-step" onClick={() => actions.bumpEstimate(task.id)} title="Increase estimate by 1h">+</button>h <span className="dot">· </span>{sessionCount} session{sessionCount === 1 ? "" : "s"}
                </div>
              )}

              {entries.length ? (
                entries.map((entry) => (
                  <div key={entry.id || "live-session"} className={`entry ${entry.live ? "live" : ""}`}>
                    <span className="when">{sessionRangeLabel(entry.start, entry.end)}{entry.live ? ` · ${SESSION_COPY.recordingLabel}` : ""}</span>
                    <span className="dur">{fmt((entry.end ?? now) - entry.start)}</span>
                    {entry.live ? (
                      <span className="entry-del" />
                    ) : (
                      <>
                        <button className="entry-edit" title="Edit session" onClick={() => actions.editSession(entry.id)}>✎</button>
                        <button className="entry-del" title="Remove session" onClick={() => actions.deleteSession(entry.id)}>×</button>
                      </>
                    )}
                  </div>
                ))
              ) : (
                <div className="entry"><span className="when">No sessions logged yet</span><span className="dur">—</span></div>
              )}
            </div>
          </div>
        </div>
        <div className="foot">
          <button className="danger" onClick={() => actions.deleteTask(task.id)}>Delete task</button>
          <button className="stopbtn" onClick={() => {
            actions.setOpenTaskId(null);
            actions.showToast({ message: TOAST_TASK_SAVED });
          }}>Save</button>
        </div>
    </AnimatedModal>
  );
}
