import React, { useState, useEffect } from "react";
import { jewelPayout, IMPACT_TIERS, IMPACT_TIER_KEYS, LIFE_AREAS } from "../utils.jsx";
import { useApp } from "../context/AppContext.jsx";
import { AnimatedModal } from "./motion-transitions.jsx";
import { DEPTH_ICONS, CADENCE_ICONS, TASK_REPEAT_COPY } from "../constants.jsx";
import { WeeklyAvailabilityEditor } from "./weekly-availability-editor.jsx";
import { JewelDots } from "./jewel-dots.jsx";
import { repeatWeekdayLabel } from "../weekly-schedule.jsx";
import { validateTaskSchedule } from "../schedule-validation";



export function NewTaskModal() {
  const { state, helpers, actions } = useApp();

  // All hooks must run unconditionally — before any early return
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [depth, setDepth] = useState("");
  const [cadence, setCadence] = useState("");
  const [deadline, setDeadline] = useState("");
  const [minSession, setMinSession] = useState("30");
  const [maxSession, setMaxSession] = useState("90");
  const [estimate, setEstimate] = useState("0.5");
  const [dailyWindows, setDailyWindows] = useState(() => [1, 2, 3, 4, 5, 6, 7].map(weekday => ({ weekday, startMinute: 540, endMinute: 1020 })));
  const [listId, setListId] = useState(state.activeListId);
  const [scheduleBlocked, setScheduleBlocked] = useState(false);
  const [impactTier, setImpactTier] = useState("");
  const [impactSign, setImpactSign] = useState(() => {
    const l = helpers.list(state.activeListId);
    return l?.lifeDirection === "decrease" ? -1 : 1;
  });
  const [explicitSign, setExplicitSign] = useState(false);

  useEffect(() => {
    const selectedList = helpers.list(listId);
    if (selectedList && !explicitSign) {
      setImpactSign(selectedList.lifeDirection === "decrease" ? -1 : 1);
    }
  }, [listId, explicitSign, helpers]);

  const listItem = helpers.list(state.activeListId);
  if (!listItem) return null;

  const getPayout = () => {
    const tier = IMPACT_TIERS[impactTier];
    if (!tier) return null;
    return { amount: impactSign * tier.weight };
  };

  const payout = getPayout();
  const selectedList = helpers.list(listId) || listItem;
  const area = selectedList.lifeArea ? LIFE_AREAS.find((a) => a.key === selectedList.lifeArea) : null;
  const earnsLabel = cadence === "daily" ? TASK_REPEAT_COPY.rewardTiming : "Earns on completion";
  const repeatDays = repeatWeekdayLabel(dailyWindows);
  const repeatCaption = repeatDays
    ? `${TASK_REPEAT_COPY.selectedDaysPrefix} ${repeatDays}. ${TASK_REPEAT_COPY.selectedDaysSuffix}`
    : TASK_REPEAT_COPY.everyDayCaption;

  const handleCreate = () => {
    if (!name.trim() || (cadence === "daily" && scheduleBlocked)) return;
    const deadlineAt = deadline ? new Date(deadline + "T00:00:00").getTime() : null;
    const hours = estimate ? parseFloat(estimate) : null;
    actions.createTaskFromDetail({
      listId,
      name: name.trim(),
      description: notes.trim(),
      depth: depth || null,
      cadence: cadence || null,
      deadlineAt,
      minSessionMin: parseInt(minSession, 10) || 5,
      maxSessionMin: parseInt(maxSession, 10) || 120,
      impactTier: impactTier || null,
      impactSign: impactSign,
      estimateMin: hours === null ? null : Math.round(hours * 60),
      dailyWindows
    });
  };

  return (
    <AnimatedModal onClose={() => actions.setOpenTaskId(null)} className="modal task-detail-two-column show" id="modal">
        <div className="top">
          <div className="art" style={{ background: `linear-gradient(135deg,${selectedList.color},${selectedList.color}55)` }}>{selectedList.emoji}</div>
          <div>
            <h2>New task</h2>
            <div className="m">{selectedList.name}</div>
          </div>
          <button className="close" onClick={() => actions.setOpenTaskId(null)}>×</button>
        </div>
        <div className="body">
          <div className="task-detail-grid">
            <div className="task-detail-column task-detail-primary">
              <h4>Name</h4>
              <input
                className="detail-name-input"
                placeholder="Task name"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <h4 className="lyr-h">♪ Notes</h4>
              <textarea
                className="lyrics-inline"
                placeholder="What will finishing this feel like? Add the goal, a note, a link…"
                rows="3"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <h4>Effort</h4>
              <span className="depth-seg">
                <button type="button" className={depth === "deep" ? "sel" : ""} onClick={() => setDepth("deep")}>{DEPTH_ICONS.deep}<span>Deep</span></button>
                <button type="button" className={depth === "shallow" ? "sel" : ""} onClick={() => setDepth("shallow")}>{DEPTH_ICONS.shallow}<span>Shallow</span></button>
                <button type="button" className={!depth ? "sel" : ""} onClick={() => setDepth("")}>{DEPTH_ICONS.none}<span>None</span></button>
              </span>
              <div className="depth-hint">
                {depth === "deep" ? "Long, focused, hard to interrupt." : depth === "shallow" ? "Quick, low-focus busywork." : "Not classified."}
              </div>
              <h4>Impact</h4>
              <div className="impact-section">
                <div className="impact-dial">
                  {IMPACT_TIER_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`impact-notch${key === impactTier ? " sel" : ""}`}
                      onClick={() => setImpactTier(curr => curr === key ? "" : key)}
                    >
                      {IMPACT_TIERS[key].label}
                      <small>{IMPACT_TIERS[key].weight}</small>
                    </button>
                  ))}
                </div>
                {impactTier && (
                  <div className="sign-group">
                    <div className="sign-toggle">
                      <button type="button" className={`sign-btn ${impactSign === 1 ? "sel" : ""}`} onClick={() => { setImpactSign(1); setExplicitSign(true); }}>For</button>
                      <button type="button" className={`sign-btn ${impactSign === -1 ? "sel neg" : ""}`} onClick={() => { setImpactSign(-1); setExplicitSign(true); }}>Against</button>
                    </div>
                  </div>
                )}
                {payout ? (
                  <div className="payout-preview">
                    {earnsLabel}: <span className="amt"><JewelDots payout={payout} areaColor={area?.color} /><b>{payout.amount > 0 ? "+" : ""}{payout.amount}</b>{area ? " " + area.label : ""}</span>
                  </div>
                ) : (
                  <div className="payout-preview muted">Choose an impact tier to set the disclosed jewel reward.</div>
                )}
              </div>
              <h4>List</h4>
              <div className="list-select-wrap">
                <select className="list-select" value={listId} onChange={(e) => setListId(e.target.value)}>
                  {state.S.lists.map((item) => (
                    <option key={item.id} value={item.id}>{item.emoji} {item.name}</option>
                  ))}
                </select>
                <svg className="list-select-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>
            <div className="task-detail-column task-detail-sessions">
              <h4>Repeat</h4>
              <span className="depth-seg cadence-seg">
                <button type="button" className={!cadence ? "sel" : ""} onClick={() => setCadence("")}>{CADENCE_ICONS.once}<span>One-time</span></button>
                <button type="button" className={cadence === "daily" ? "sel" : ""} onClick={() => setCadence("daily")}>{CADENCE_ICONS.daily}<span>{TASK_REPEAT_COPY.optionLabel}</span></button>
              </span>
              <div className="depth-hint">
                {cadence === "daily" ? repeatCaption : "Finishes once. Its jewel pays on completion."}
              </div>

              {cadence === "daily" ? (
                <>
                  <h4>{TASK_REPEAT_COPY.scheduleHeading}</h4>
                  <div className="detail-weekly-editor">
                    <WeeklyAvailabilityEditor
                      id="newTaskDailyWindows"
                      initialWindows={dailyWindows}
                      onSave={(nextWindows) => setDailyWindows(nextWindows)}
                      requireWeekday
                      daysAriaLabel={TASK_REPEAT_COPY.scheduleDaysAriaLabel}
                      inspectWindows={(candidate) => validateTaskSchedule(
                        candidate,
                        state.S.tasks
                          .filter((task) => task.cadence)
                          .map((task) => ({ id: task.id, name: task.name, windows: task.dailyWindows })),
                      )}
                      onBlockingChange={setScheduleBlocked}
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
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                  <h4>Session size</h4>
                  <div className="session-range-row">
                    <label><span>Shortest</span><input type="number" min="1" max="1440" placeholder="30" value={minSession} onChange={(e) => setMinSession(e.target.value)} /> min</label>
                    <span className="range-sep">to</span>
                    <label><span>Longest</span><input type="number" min="1" max="1440" placeholder="90" value={maxSession} onChange={(e) => setMaxSession(e.target.value)} /> min</label>
                  </div>
                  <div className="depth-hint">The planner splits this task into blocks inside this range.</div>
                </>
              )}
              <div className="sh"><h4>Sessions</h4></div>
              {cadence !== "daily" ? (
                <div className="det-total">
                  0m <span className="of">of</span> <input className="est-inline" type="number" min="0.25" max="1000" step="0.25" value={estimate} onChange={(e) => setEstimate(e.target.value)} />h <span className="dot">· </span>0 sessions
                </div>
              ) : (
                <div className="det-total">
                  0m <span className="dot">· </span>0 sessions
                </div>
              )}
              <div className="entry"><span className="when">No sessions logged yet</span><span className="dur">—</span></div>
            </div>
          </div>
        </div>
        <div className="foot">
          <button className="stopbtn" onClick={() => actions.setOpenTaskId(null)}>Cancel</button>
          <button className="create-task-btn" disabled={cadence === "daily" && scheduleBlocked} onClick={handleCreate}>Create task</button>
        </div>
    </AnimatedModal>
  );
}
