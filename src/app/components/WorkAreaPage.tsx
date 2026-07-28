import { useMemo, useState } from "react";
import { BriefcaseBusiness, FolderPlus, Plus, Repeat2 } from "lucide-react";
import { buildAdaptiveAreaModel } from "../adaptive-area-model";
import {
  ADAPTIVE_AREA_COPY,
  ADAPTIVE_AREA_LIMITS,
  TASK_CADENCE_DAILY,
  WORK_AREA_COPY,
  WORK_AREA_KEY,
} from "../constants";
import { useApp } from "../context/app-context-value";
import { useSessionNow } from "../hooks/use-session-now";
import { WorkProjects } from "./adaptive-area-collections";
import {
  AdaptiveAreaShell,
  AdaptiveShowAll,
  AdaptiveTaskSection,
  AdaptiveUpcoming,
} from "./adaptive-area-sections";

export function WorkAreaPage() {
  const { state, helpers, actions } = useApp();
  const [showAllActions, setShowAllActions] = useState(false);
  const [showAllRoutines, setShowAllRoutines] = useState(false);
  const [showAllStructure, setShowAllStructure] = useState(false);
  const now = useSessionNow(state.S.run.activeSessionId);
  const model = useMemo(
    () => buildAdaptiveAreaModel(state.S, WORK_AREA_KEY, now),
    [state.S, now],
  );
  const attentionTaskIds = useMemo(
    () => new Set(helpers.attentionTasks().map((task) => task.id)),
    [helpers, state.S],
  );
  const remainingActions = model.nextActions.filter((entry) => entry.task.id !== model.currentEntry?.task.id);
  const remainingRoutines = model.routines.filter((entry) => entry.task.id !== model.currentEntry?.task.id);
  const actionsShown = showAllActions ? remainingActions : remainingActions.slice(0, ADAPTIVE_AREA_LIMITS.actions);
  const routinesShown = showAllRoutines ? remainingRoutines : remainingRoutines.slice(0, ADAPTIVE_AREA_LIMITS.routines);
  const projectsShown = showAllStructure ? model.lists : model.lists.slice(0, ADAPTIVE_AREA_LIMITS.structure);
  const currentEntries = model.currentEntry ? [model.currentEntry] : [];

  return (
    <AdaptiveAreaShell areaKey={WORK_AREA_KEY} subtitle={WORK_AREA_COPY.pageSubtitle}>
      {!model.lists.length ? (
        <div className="health-area-empty">
          <BriefcaseBusiness size={34} aria-hidden="true" />
          <h2>{WORK_AREA_COPY.emptyPageTitle}</h2>
          <p>{WORK_AREA_COPY.emptyPageBody}</p>
          <button className="pill primary" type="button" onClick={() => actions.addList(WORK_AREA_KEY)}>
            <FolderPlus size={16} />{WORK_AREA_COPY.addProject}
          </button>
        </div>
      ) : (
        <>
          <div className="health-area-actions">
            <button className="pill primary" type="button" onClick={() => actions.addTask({ areaKey: WORK_AREA_KEY })}>
              <Plus size={16} />{WORK_AREA_COPY.addTask}
            </button>
            <button className="pill" type="button" onClick={() => actions.addTask({ areaKey: WORK_AREA_KEY, cadence: TASK_CADENCE_DAILY })}>
              <Repeat2 size={16} />{WORK_AREA_COPY.addRoutine}
            </button>
            <button className="pill" type="button" onClick={() => actions.addList(WORK_AREA_KEY)}>
              <FolderPlus size={16} />{WORK_AREA_COPY.addProject}
            </button>
          </div>
          <div className="adaptive-area-dashboard">
            <div className="adaptive-area-spotlight">
            <AdaptiveTaskSection heading={WORK_AREA_COPY.currentHeading} entries={currentEntries} emptyCopy={WORK_AREA_COPY.emptyCurrent} countCopy={ADAPTIVE_AREA_COPY.itemCount} state={state} helpers={helpers} attentionTaskIds={attentionTaskIds} spotlight />
            </div>
            <div className="adaptive-area-execution health-area-primary">
              <AdaptiveTaskSection heading={WORK_AREA_COPY.actionsHeading} entries={actionsShown} emptyCopy={WORK_AREA_COPY.emptyActions} countCopy={WORK_AREA_COPY.actionCount} state={state} helpers={helpers} attentionTaskIds={attentionTaskIds} />
              <AdaptiveShowAll shown={showAllActions} total={remainingActions.length} limit={ADAPTIVE_AREA_LIMITS.actions} onClick={() => setShowAllActions((shown) => !shown)} />
              <AdaptiveTaskSection heading={WORK_AREA_COPY.routinesHeading} entries={routinesShown} emptyCopy={WORK_AREA_COPY.emptyRoutines} countCopy={WORK_AREA_COPY.routineCount} state={state} helpers={helpers} attentionTaskIds={attentionTaskIds} />
              <AdaptiveShowAll shown={showAllRoutines} total={remainingRoutines.length} limit={ADAPTIVE_AREA_LIMITS.routines} onClick={() => setShowAllRoutines((shown) => !shown)} />
            </div>
            <div className="adaptive-area-structure">
              <WorkProjects lists={projectsShown} tasks={model.tasks} albums={state.S.albums} onOpen={actions.selectList} />
              <AdaptiveShowAll shown={showAllStructure} total={model.lists.length} limit={ADAPTIVE_AREA_LIMITS.structure} onClick={() => setShowAllStructure((shown) => !shown)} />
            </div>
            <div className="adaptive-area-context health-area-secondary">
              <AdaptiveUpcoming heading={WORK_AREA_COPY.upcomingHeading} items={model.upcoming.slice(0, ADAPTIVE_AREA_LIMITS.upcoming)} emptyCopy={WORK_AREA_COPY.emptyUpcoming} onOpenTask={actions.setOpenTaskId} />
            </div>
          </div>
        </>
      )}
    </AdaptiveAreaShell>
  );
}
