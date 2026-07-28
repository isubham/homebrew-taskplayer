import { ChevronRight, Focus, Target } from "lucide-react";
import { GOAL_STATUS, HEALTH_AREA_COPY, HEALTH_AREA_LIMITS } from "../constants";

export function HealthCurrentFocus({ currentFocus, onOpenGoal, onOpenTask }) {
  return (
    <section className="health-current-focus">
      <div className="health-section-heading">
        <h2>{HEALTH_AREA_COPY.currentFocusHeading}</h2><Focus size={16} />
      </div>
      {currentFocus
        ? <GoalCard entry={currentFocus} featured onOpenGoal={onOpenGoal} onOpenTask={onOpenTask} />
        : <div className="health-empty-inline">{HEALTH_AREA_COPY.noCurrentFocus}</div>}
    </section>
  );
}

export function HealthGoalList({ goals, currentFocus, onOpenGoal, onOpenTask }) {
  const visibleGoals = goals.filter(
    ({ goal }) => goal.status !== GOAL_STATUS.archived && goal.id !== currentFocus?.goal.id,
  ).slice(0, HEALTH_AREA_LIMITS.goals);
  return (
    <section className="health-section">
      <div className="health-section-heading">
        <h2>{HEALTH_AREA_COPY.goalsHeading}</h2><span>{visibleGoals.length}</span>
      </div>
      <div className="health-goal-grid">
        {visibleGoals.map((entry) => (
          <GoalCard key={entry.goal.id} entry={entry} onOpenGoal={onOpenGoal} onOpenTask={onOpenTask} />
        ))}
      </div>
      {!visibleGoals.length ? <div className="health-empty-inline">{HEALTH_AREA_COPY.noOtherGoals}</div> : null}
    </section>
  );
}

function GoalCard({ entry, featured = false, onOpenGoal, onOpenTask }) {
  const { goal, actionCount, completedActions, routineCount, nextTask } = entry;
  const progress = actionCount ? Math.round((completedActions / actionCount) * 100) : null;
  return (
    <article className={`health-goal-card${featured ? " featured" : ""}${goal.status === GOAL_STATUS.completed ? " completed" : ""}`}>
      <button type="button" className="health-goal-main" onClick={() => onOpenGoal(goal.id)} aria-label={HEALTH_AREA_COPY.editGoalLabel(goal.title)}>
        <Target size={featured ? 20 : 17} />
        <span>
          <strong>{goal.title}</strong>
          {goal.status === GOAL_STATUS.completed ? <em>{HEALTH_AREA_COPY.completedGoalLabel}</em> : null}
          {goal.description ? <small>{goal.description}</small> : null}
        </span>
      </button>
      {actionCount ? (
        <div className="health-goal-progress">
          <span><span style={{ width: `${progress}%` }} /></span>
          <small>{HEALTH_AREA_COPY.goalProgress(completedActions, actionCount)}</small>
        </div>
      ) : null}
      {routineCount ? <small className="health-goal-meta">{HEALTH_AREA_COPY.linkedRoutineCount(routineCount)}</small> : null}
      {nextTask ? (
        <button type="button" className="health-goal-next" onClick={() => onOpenTask(nextTask.id)}>
          <span>{HEALTH_AREA_COPY.nextActionLabel}</span><strong>{nextTask.name}</strong><ChevronRight size={15} />
        </button>
      ) : !actionCount && !routineCount ? <small className="health-goal-meta">{HEALTH_AREA_COPY.noLinkedWork}</small> : null}
    </article>
  );
}
