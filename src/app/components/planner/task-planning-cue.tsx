import { CalendarPlus } from "lucide-react";
import type { PlannedSession } from "../../bindings";
import { PLANNER_COPY, PLANNER_ROW_ICON_SIZE } from "../../constants";
import { sessionRangeLabel } from "../../session-time";

type TaskPlanningCueProps = {
  taskId: string;
  plans?: PlannedSession[];
  onPlan: (taskId: string, planId?: string) => void;
};

export function TaskPlanningCue({ taskId, plans = [], onPlan }: TaskPlanningCueProps) {
  const now = Date.now();
  const next = plans
    .filter((plan) => plan.taskId === taskId && plan.start != null && plan.end != null && plan.end > now)
    .sort((left, right) => (left.start || 0) - (right.start || 0))[0];
  const label = next?.start != null
    ? PLANNER_COPY.nextPlanLabel(sessionRangeLabel(next.start, next.end))
    : PLANNER_COPY.planTaskButton;

  return (
    <button
      className={`task-planning-cue${next ? " has-plan" : ""}`}
      title={next ? PLANNER_COPY.editTaskPlanTitle : PLANNER_COPY.planTaskTitle}
      onClick={(event) => { event.stopPropagation(); onPlan(taskId, next?.id); }}
    >
      <CalendarPlus size={PLANNER_ROW_ICON_SIZE} />
      <span>{label}</span>
    </button>
  );
}
