import { useMemo, useState } from "react";
import { HeartPulse, ListPlus, Plus, Repeat2, Target } from "lucide-react";
import { useApp } from "../context/app-context-value";
import { buildHealthAreaModel } from "../health-area-model";
import { HEALTH_AREA_COPY, HEALTH_AREA_KEY, HEALTH_AREA_LIMITS, TASK_CADENCE_DAILY } from "../constants";
import { LIFE_AREAS } from "../utils";
import { useSessionNow } from "../hooks/use-session-now";
import { StickyHeader } from "./sticky-header";
import { HealthCollections, HealthTaskSection, HealthUpcoming } from "./health-area-sections";
import { HealthCurrentFocus, HealthGoalList } from "./health-goal-sections";

export function HealthAreaPage() {
  const { state, helpers, actions } = useApp();
  const [showAllActions, setShowAllActions] = useState(false);
  const [showAllRoutines, setShowAllRoutines] = useState(false);
  const now = useSessionNow(state.S.run.activeSessionId);
  const model = useMemo(() => buildHealthAreaModel(state.S, now), [state.S, now]);
  const attentionTaskIds = useMemo(
    () => new Set(helpers.attentionTasks().map((task) => task.id)),
    [helpers, state.S],
  );
  const area = LIFE_AREAS.find((candidate) => candidate.key === HEALTH_AREA_KEY);
  const visibleActions = showAllActions
    ? model.nextActions
    : model.nextActions.slice(0, HEALTH_AREA_LIMITS.nextActions);
  const visibleRoutines = showAllRoutines
    ? model.routines
    : model.routines.slice(0, HEALTH_AREA_LIMITS.routines);
  const visibleUpcoming = model.upcoming.slice(0, HEALTH_AREA_LIMITS.upcoming);
  const pageStyle = { "--health-area-color": area?.color };

  if (!model.lists.length && !model.goals.length) {
    return (
      <div className="health-area-page" style={pageStyle}>
        <StickyHeader icon={<HeartPulse size={18} />} name={HEALTH_AREA_COPY.pageTitle} />
        <HealthHeader />
        <div className="health-area-empty">
          <HeartPulse size={34} aria-hidden="true" />
          <h2>{HEALTH_AREA_COPY.emptyPageTitle}</h2>
          <p>{HEALTH_AREA_COPY.emptyPageBody}</p>
          <div className="health-empty-actions">
            <button className="pill primary" type="button" onClick={() => actions.setOpenGoalId("new")}><Target size={16} />{HEALTH_AREA_COPY.addGoal}</button>
            <button className="pill" type="button" onClick={() => actions.addList(HEALTH_AREA_KEY)}><ListPlus size={16} />{HEALTH_AREA_COPY.addList}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="health-area-page" style={pageStyle}>
      <StickyHeader icon={<HeartPulse size={18} />} name={HEALTH_AREA_COPY.pageTitle} />
      <HealthHeader />
      <div className="health-area-actions">
        {model.lists.length ? (
          <>
            <button className="pill primary" type="button" onClick={() => actions.addTask({ areaKey: HEALTH_AREA_KEY })}>
              <Plus size={16} />{HEALTH_AREA_COPY.addTask}
            </button>
            <button className="pill" type="button" onClick={() => actions.addTask({ areaKey: HEALTH_AREA_KEY, cadence: TASK_CADENCE_DAILY })}>
              <Repeat2 size={16} />{HEALTH_AREA_COPY.addRoutine}
            </button>
            <button className="pill" type="button" onClick={() => actions.addList(HEALTH_AREA_KEY)}>
              <ListPlus size={16} />{HEALTH_AREA_COPY.addList}
            </button>
          </>
        ) : (
          <button className="pill" type="button" onClick={() => actions.addList(HEALTH_AREA_KEY)}>
            <ListPlus size={16} />{HEALTH_AREA_COPY.addList}
          </button>
        )}
        <button className="pill" type="button" onClick={() => actions.setOpenGoalId("new")}>
          <Target size={16} />{HEALTH_AREA_COPY.addGoal}
        </button>
      </div>
      <div className="adaptive-area-dashboard">
        <div className="adaptive-area-spotlight">
          <HealthCurrentFocus currentFocus={model.currentFocus} onOpenGoal={actions.setOpenGoalId} onOpenTask={actions.setOpenTaskId} />
        </div>
        <div className="adaptive-area-execution health-area-primary">
          <HealthTaskSection
            heading={HEALTH_AREA_COPY.nextActionsHeading}
            entries={visibleActions}
            emptyCopy={HEALTH_AREA_COPY.emptyActions}
            countCopy={HEALTH_AREA_COPY.actionCount}
            state={state}
            helpers={helpers}
            attentionTaskIds={attentionTaskIds}
          />
          <ShowAllButton shown={showAllActions} total={model.nextActions.length} limit={HEALTH_AREA_LIMITS.nextActions} onClick={() => setShowAllActions((current) => !current)} />
          <HealthTaskSection
            heading={HEALTH_AREA_COPY.routinesHeading}
            entries={visibleRoutines}
            emptyCopy={HEALTH_AREA_COPY.emptyRoutines}
            countCopy={HEALTH_AREA_COPY.routineCount}
            state={state}
            helpers={helpers}
            attentionTaskIds={attentionTaskIds}
          />
          <ShowAllButton shown={showAllRoutines} total={model.routines.length} limit={HEALTH_AREA_LIMITS.routines} onClick={() => setShowAllRoutines((current) => !current)} />
        </div>
        <div className="adaptive-area-structure">
          <HealthGoalList goals={model.goals} currentFocus={model.currentFocus} onOpenGoal={actions.setOpenGoalId} onOpenTask={actions.setOpenTaskId} />
        </div>
        <div className="adaptive-area-context health-area-secondary">
          <HealthUpcoming items={visibleUpcoming} onOpenTask={actions.setOpenTaskId} />
          <HealthCollections lists={model.lists} tasks={model.tasks} nextActions={model.nextActions} onOpen={actions.selectList} />
        </div>
      </div>
    </div>
  );
}

function HealthHeader() {
  return (
    <div className="hdr health-area-hero" data-tauri-drag-region>
      <div className="cover"><HeartPulse size={64} /></div>
      <div className="info">
        <small>{HEALTH_AREA_COPY.pageSubtitle}</small>
        <h1>{HEALTH_AREA_COPY.pageTitle}</h1>
      </div>
    </div>
  );
}

function ShowAllButton({ shown, total, limit, onClick }) {
  if (total <= limit) return null;
  return <button type="button" className="health-show-all" onClick={onClick}>{shown ? HEALTH_AREA_COPY.showLess : HEALTH_AREA_COPY.viewAll(total)}</button>;
}
