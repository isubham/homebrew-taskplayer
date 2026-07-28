import { useMemo, useState } from "react";
import { Archive, Target } from "lucide-react";
import { GOAL_COPY, GOAL_EDITOR_LIMITS, GOAL_STATUS, GOAL_STATUS_VALUES, HEALTH_AREA_KEY } from "../constants";
import { useApp } from "../context/app-context-value";
import { AnimatedModal } from "./motion-transitions";

export function GoalModal() {
  const { state, actions } = useApp();
  const existing = state.S.goals?.find((goal) => goal.id === state.openGoalId) || null;
  const existingLinks = useMemo(
    () => new Set((state.S.goalTaskLinks || []).filter((link) => link.goalId === existing?.id).map((link) => link.taskId)),
    [existing?.id, state.S.goalTaskLinks],
  );
  const healthListIds = useMemo(
    () => new Set(state.S.lists.filter((list) => list.lifeArea === HEALTH_AREA_KEY).map((list) => list.id)),
    [state.S.lists],
  );
  const availableTasks = useMemo(
    () => state.S.tasks.filter((task) => healthListIds.has(task.listId)),
    [healthListIds, state.S.tasks],
  );
  const [title, setTitle] = useState(existing?.title || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [status, setStatus] = useState(
    GOAL_STATUS_VALUES.includes(existing?.status) ? existing.status : GOAL_STATUS.active,
  );
  const [isCurrentFocus, setIsCurrentFocus] = useState(existing?.isCurrentFocus || false);
  const [taskIds, setTaskIds] = useState(existingLinks);
  const [nextTaskId, setNextTaskId] = useState(existing?.nextTaskId || "");
  const toggleTask = (taskId) => {
    setTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
        if (nextTaskId === taskId) setNextTaskId("");
      } else {
        next.add(taskId);
      }
      return next;
    });
  };
  const save = () => actions.saveGoal({
    id: existing?.id || null,
    lifeArea: HEALTH_AREA_KEY,
    title: title.trim(),
    description: description.trim() || null,
    status,
    isCurrentFocus: status === GOAL_STATUS.active && isCurrentFocus,
    nextTaskId: nextTaskId || null,
    taskIds: [...taskIds],
  });
  const archive = async () => {
    const ok = await actions.uiConfirm(GOAL_COPY.archiveTitle, GOAL_COPY.archiveBody, GOAL_COPY.archive);
    if (ok) actions.archiveGoal(existing.id);
  };

  return (
    <AnimatedModal className="modal dlg goal-modal show" onClose={() => actions.setOpenGoalId(null)}>
      <div className="top">
        <div><h2><Target size={20} />{existing ? GOAL_COPY.editTitle : GOAL_COPY.createTitle}</h2></div>
        <button className="close" onClick={() => actions.setOpenGoalId(null)}>×</button>
      </div>
      <div className="body goal-modal-body">
        <label>{GOAL_COPY.titleLabel}<input autoFocus maxLength={GOAL_EDITOR_LIMITS.title} value={title} placeholder={GOAL_COPY.titlePlaceholder} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>{GOAL_COPY.descriptionLabel}<textarea maxLength={GOAL_EDITOR_LIMITS.description} value={description} placeholder={GOAL_COPY.descriptionPlaceholder} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="goal-modal-row">
          <label>{GOAL_COPY.statusLabel}<select value={status} onChange={(event) => { const nextStatus = event.target.value; setStatus(nextStatus); if (nextStatus !== GOAL_STATUS.active) setIsCurrentFocus(false); }}><option value={GOAL_STATUS.active}>{GOAL_COPY.activeStatus}</option><option value={GOAL_STATUS.completed}>{GOAL_COPY.completedStatus}</option></select></label>
          <label className="goal-focus-toggle"><input type="checkbox" checked={isCurrentFocus} disabled={status !== GOAL_STATUS.active} onChange={(event) => setIsCurrentFocus(event.target.checked)} />{GOAL_COPY.currentFocusLabel}</label>
        </div>
        <fieldset><legend>{GOAL_COPY.linkedWorkHeading}</legend><p>{GOAL_COPY.linkedWorkHint}</p>
          {availableTasks.length ? <div className="goal-task-picker">{availableTasks.map((task) => <label key={task.id}><input type="checkbox" checked={taskIds.has(task.id)} onChange={() => toggleTask(task.id)} /><span>{task.name}</span></label>)}</div> : <p>{GOAL_COPY.noHealthWork}</p>}
        </fieldset>
        <label>{GOAL_COPY.nextActionLabel}<select value={nextTaskId} onChange={(event) => setNextTaskId(event.target.value)}><option value="">{GOAL_COPY.noNextAction}</option>{availableTasks.filter((task) => taskIds.has(task.id)).map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</select></label>
      </div>
      <div className="actions">
        {existing ? <button className="pill danger" onClick={archive}><Archive size={15} />{GOAL_COPY.archive}</button> : <span />}
        <button className="pill primary" disabled={!title.trim()} onClick={save}>{GOAL_COPY.save}</button>
      </div>
    </AnimatedModal>
  );
}
