import { ArrowRight, CalendarClock } from "lucide-react";
import { AUTOMATIC_PLAN_COPY, PLANNER_ICON_SIZE, PLANNER_VIEW_KEY } from "../../constants";
import { useApp } from "../../context/AppContext";
import { sessionRangeLabel } from "../../session-time";

export function NextPlannedBlock() {
  const { state, actions } = useApp();
  const now = Date.now();
  const plan = [...(state.S.plannedSessions || [])]
    .filter((item) => item.start != null && item.end != null && item.end > now)
    .sort((left, right) => (left.start || 0) - (right.start || 0))[0];
  const task = plan ? state.S.tasks.find((item) =>
    item.id === plan.taskId && !item.completedAt && !item.cadence) : null;
  const list = task ? state.S.lists.find((item) => item.id === task.listId) : null;
  if (!plan || !task || plan.start == null || plan.end == null) return null;

  return (
    <button
      className="next-planned-block"
      type="button"
      title={AUTOMATIC_PLAN_COPY.nextOpenTitle}
      onClick={() => actions.navigate({
        view: PLANNER_VIEW_KEY,
        planTaskId: task.id,
        planSessionId: plan.id,
      })}
    >
      <CalendarClock size={PLANNER_ICON_SIZE} />
      <span>
        <small>{AUTOMATIC_PLAN_COPY.nextHeading}</small>
        <strong>{task.name}</strong>
        <em>{AUTOMATIC_PLAN_COPY.nextMeta(
          list?.name || AUTOMATIC_PLAN_COPY.unknownList,
          sessionRangeLabel(plan.start, plan.end),
        )}</em>
      </span>
      <ArrowRight size={PLANNER_ICON_SIZE} />
    </button>
  );
}
