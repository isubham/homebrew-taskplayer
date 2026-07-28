import { useMemo, useState } from "react";
import { Plus, Repeat2, UsersRound } from "lucide-react";
import { buildAdaptiveAreaModel } from "../adaptive-area-model";
import {
  ADAPTIVE_AREA_COPY,
  ADAPTIVE_AREA_LIMITS,
  RELATIONSHIPS_AREA_COPY,
  RELATIONSHIPS_AREA_KEY,
  TASK_CADENCE_DAILY,
} from "../constants";
import { useApp } from "../context/app-context-value";
import { useSessionNow } from "../hooks/use-session-now";
import { RelationshipCollections } from "./adaptive-area-collections";
import {
  AdaptiveAreaShell,
  AdaptiveShowAll,
  AdaptiveTaskSection,
  AdaptiveUpcoming,
} from "./adaptive-area-sections";

export function RelationshipsAreaPage() {
  const { state, helpers, actions } = useApp();
  const [showAllActions, setShowAllActions] = useState(false);
  const [showAllRoutines, setShowAllRoutines] = useState(false);
  const [showAllStructure, setShowAllStructure] = useState(false);
  const now = useSessionNow(state.S.run.activeSessionId);
  const model = useMemo(
    () => buildAdaptiveAreaModel(state.S, RELATIONSHIPS_AREA_KEY, now),
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
  const collectionsShown = showAllStructure ? model.lists : model.lists.slice(0, ADAPTIVE_AREA_LIMITS.structure);
  const currentEntries = model.currentEntry ? [model.currentEntry] : [];

  return (
    <AdaptiveAreaShell areaKey={RELATIONSHIPS_AREA_KEY} subtitle={RELATIONSHIPS_AREA_COPY.pageSubtitle}>
      {!model.lists.length ? (
        <div className="health-area-empty">
          <UsersRound size={34} aria-hidden="true" />
          <h2>{RELATIONSHIPS_AREA_COPY.emptyPageTitle}</h2>
          <p>{RELATIONSHIPS_AREA_COPY.emptyPageBody}</p>
          <button className="pill primary" type="button" onClick={() => actions.addList(RELATIONSHIPS_AREA_KEY)}>
            <UsersRound size={16} />{RELATIONSHIPS_AREA_COPY.addCircle}
          </button>
        </div>
      ) : (
        <>
          <div className="health-area-actions">
            <button className="pill primary" type="button" onClick={() => actions.addTask({ areaKey: RELATIONSHIPS_AREA_KEY })}>
              <Plus size={16} />{RELATIONSHIPS_AREA_COPY.addAction}
            </button>
            <button className="pill" type="button" onClick={() => actions.addTask({ areaKey: RELATIONSHIPS_AREA_KEY, cadence: TASK_CADENCE_DAILY })}>
              <Repeat2 size={16} />{RELATIONSHIPS_AREA_COPY.addRoutine}
            </button>
            <button className="pill" type="button" onClick={() => actions.addList(RELATIONSHIPS_AREA_KEY)}>
              <UsersRound size={16} />{RELATIONSHIPS_AREA_COPY.addCircle}
            </button>
          </div>
          <div className="adaptive-area-dashboard">
            <div className="adaptive-area-spotlight">
            <AdaptiveTaskSection heading={RELATIONSHIPS_AREA_COPY.currentHeading} entries={currentEntries} emptyCopy={RELATIONSHIPS_AREA_COPY.emptyCurrent} countCopy={ADAPTIVE_AREA_COPY.itemCount} state={state} helpers={helpers} attentionTaskIds={attentionTaskIds} spotlight />
            </div>
            <div className="adaptive-area-execution health-area-primary">
              <AdaptiveTaskSection heading={RELATIONSHIPS_AREA_COPY.actionsHeading} entries={actionsShown} emptyCopy={RELATIONSHIPS_AREA_COPY.emptyActions} countCopy={RELATIONSHIPS_AREA_COPY.actionCount} state={state} helpers={helpers} attentionTaskIds={attentionTaskIds} />
              <AdaptiveShowAll shown={showAllActions} total={remainingActions.length} limit={ADAPTIVE_AREA_LIMITS.actions} onClick={() => setShowAllActions((shown) => !shown)} />
              <AdaptiveTaskSection heading={RELATIONSHIPS_AREA_COPY.routinesHeading} entries={routinesShown} emptyCopy={RELATIONSHIPS_AREA_COPY.emptyRoutines} countCopy={RELATIONSHIPS_AREA_COPY.routineCount} state={state} helpers={helpers} attentionTaskIds={attentionTaskIds} />
              <AdaptiveShowAll shown={showAllRoutines} total={remainingRoutines.length} limit={ADAPTIVE_AREA_LIMITS.routines} onClick={() => setShowAllRoutines((shown) => !shown)} />
            </div>
            <div className="adaptive-area-structure">
              <RelationshipCollections lists={collectionsShown} tasks={model.tasks} nextActions={remainingActions} onOpen={actions.selectList} />
              <AdaptiveShowAll shown={showAllStructure} total={model.lists.length} limit={ADAPTIVE_AREA_LIMITS.structure} onClick={() => setShowAllStructure((shown) => !shown)} />
            </div>
            <div className="adaptive-area-context health-area-secondary">
              <AdaptiveUpcoming heading={RELATIONSHIPS_AREA_COPY.upcomingHeading} items={model.upcoming.slice(0, ADAPTIVE_AREA_LIMITS.upcoming)} emptyCopy={RELATIONSHIPS_AREA_COPY.emptyUpcoming} onOpenTask={actions.setOpenTaskId} />
            </div>
          </div>
        </>
      )}
    </AdaptiveAreaShell>
  );
}
