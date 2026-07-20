import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { PlannedSession } from "../bindings";
import {
  PLANNER_CLOCK_TICK_MS,
  PLANNER_BLOCK_KINDS,
  PLANNER_COPY,
  PLANNER_DATE_SHORT_FORMAT,
  PLANNER_DAY_COUNT,
  PLANNER_ICON_SIZE,
  PLANNER_MODAL_INITIAL_REVISION,
  PLANNER_MODAL_REVISION_STEP,
  PLANNER_VIEW_MODES,
} from "../constants";
import { useApp } from "../context/AppContext";
import { buildPlannerDays } from "../planner/planner-model";
import { addLocalDays, startOfLocalDay } from "../planner/planner-time";
import type { PlannerDragSelection } from "../planner/use-planner-drag-selection";
import { usePlannerCommands } from "../planner/use-planner-commands";
import { PlannerCalendar } from "./planner/planner-calendar";
import { AutomaticPlannerControl } from "./planner/automatic-planner-control";
import { PlannedSessionModal } from "./planner/planned-session-modal";
import { RecordSessionModal } from "./planner/record-session-modal";
import "./planner/planner.css";

type SessionRange = { start: number; end: number };
type EditorState = { anchorDay: number; revision: number; plan?: PlannedSession | null; taskId?: string | null; range?: SessionRange | null };
type RecordEditorState = { anchorDay: number; revision: number; range?: SessionRange | null };
type PlannerViewMode = typeof PLANNER_VIEW_MODES[keyof typeof PLANNER_VIEW_MODES];

export function PlannerPage() {
  const { state, actions } = useApp();
  const [mode, setMode] = useState<PlannerViewMode>(PLANNER_VIEW_MODES.today);
  const [anchor, setAnchor] = useState(() => startOfLocalDay(Date.now()));
  const [now, setNow] = useState(Date.now());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [recordEditor, setRecordEditor] = useState<RecordEditorState | null>(null);
  const modalRevision = useRef(PLANNER_MODAL_INITIAL_REVISION);
  const nextModalRevision = () => (modalRevision.current += PLANNER_MODAL_REVISION_STEP);
  const planner = usePlannerCommands(actions, state.S);
  const dayCount = mode === PLANNER_VIEW_MODES.today ? 1 : PLANNER_DAY_COUNT;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), PLANNER_CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const target = state.plannerTarget;
    if (!target) return;
    const plan = (state.S.plannedSessions || []).find((item) => item.id === target.planId);
    const targetDay = plan?.start != null ? startOfLocalDay(plan.start) : startOfLocalDay(Date.now());
    setAnchor(targetDay);
    setRecordEditor(null);
    setEditor({ anchorDay: targetDay, revision: nextModalRevision(), plan, taskId: target.taskId });
    actions.clearPlannerTarget();
  }, [state.plannerTarget, state.S.plannedSessions, actions]);

  const days = useMemo(() => buildPlannerDays(state.S, anchor, dayCount, now), [state.S, anchor, dayCount, now]);
  const plans = state.S.plannedSessions || [];
  const findPlan = (id: string) => plans.find((plan) => plan.id === id);
  const openEdit = (id: string) => {
    const plan = findPlan(id);
    if (plan?.start != null) {
      setRecordEditor(null);
      setEditor({ anchorDay: startOfLocalDay(plan.start), revision: nextModalRevision(), plan });
    }
  };
  const startPlan = (id: string) => {
    const plan = findPlan(id);
    if (plan) planner.start(plan);
  };
  const removePlan = (id: string) => {
    const plan = findPlan(id);
    if (plan) planner.remove(plan);
  };
  const selectRange = (selection: PlannerDragSelection) => {
    if (selection.kind === PLANNER_BLOCK_KINDS.actual) {
      setEditor(null);
      setRecordEditor({ anchorDay: selection.anchorDay, revision: nextModalRevision(), range: selection.range });
    } else {
      setRecordEditor(null);
      setEditor({ anchorDay: selection.anchorDay, revision: nextModalRevision(), range: selection.range });
    }
  };
  const end = addLocalDays(anchor, dayCount - 1);
  const startLabel = new Date(anchor).toLocaleDateString(undefined, PLANNER_DATE_SHORT_FORMAT);
  const endLabel = new Date(end).toLocaleDateString(undefined, PLANNER_DATE_SHORT_FORMAT);
  const periodLabel = dayCount === 1 ? days[0]?.heading : PLANNER_COPY.dateRangeLabel(startLabel, endLabel);

  return (
    <div className={`planner-page planner-page-${mode}`}>
      <header className="planner-page-header">
        <div className="planner-title-icon"><CalendarDays /></div>
        <div className="planner-title-copy">
          <small>{PLANNER_COPY.eyebrow}</small>
          <h1>{periodLabel}</h1>
          <p>{PLANNER_COPY.subtitle}</p>
        </div>
        <div className="planner-header-actions">
          <AutomaticPlannerControl />
          <button className="btn primary planner-add" onClick={() => { setRecordEditor(null); setEditor({ anchorDay: Math.max(anchor, startOfLocalDay(Date.now())), revision: nextModalRevision() }); }}>
            <Plus size={PLANNER_ICON_SIZE} />{PLANNER_COPY.addButton}
          </button>
        </div>
      </header>
      <div className="planner-toolbar">
        <div className="period-tabs planner-mode-tabs">
          <button className={mode === PLANNER_VIEW_MODES.today ? "active" : ""} onClick={() => setMode(PLANNER_VIEW_MODES.today)}>{PLANNER_COPY.todayTab}</button>
          <button className={mode === PLANNER_VIEW_MODES.week ? "active" : ""} onClick={() => setMode(PLANNER_VIEW_MODES.week)}>{PLANNER_COPY.weekTab}</button>
        </div>
        <div className="planner-period-actions">
          <button title={PLANNER_COPY.previousButton} aria-label={PLANNER_COPY.previousButton} onClick={() => setAnchor(addLocalDays(anchor, -dayCount))}><ChevronLeft size={PLANNER_ICON_SIZE} /></button>
          <button onClick={() => setAnchor(startOfLocalDay(Date.now()))}>{PLANNER_COPY.todayButton}</button>
          <button title={PLANNER_COPY.nextButton} aria-label={PLANNER_COPY.nextButton} onClick={() => setAnchor(addLocalDays(anchor, dayCount))}><ChevronRight size={PLANNER_ICON_SIZE} /></button>
        </div>
      </div>
      <div className="planner-drag-hint">{PLANNER_COPY.dragHint}</div>
      <PlannerCalendar
        days={days}
        now={now}
        onAdd={(anchorDay) => { setRecordEditor(null); setEditor({ anchorDay, revision: nextModalRevision() }); }}
        onRecord={(anchorDay) => { setEditor(null); setRecordEditor({ anchorDay, revision: nextModalRevision() }); }}
        onSelectRange={selectRange}
        onEdit={openEdit}
        onEditActual={actions.editSession}
        onOpenReference={(listId, taskId) => { actions.selectList(listId); if (taskId) actions.setOpenTaskId(taskId); }}
        onStart={startPlan}
        onDelete={removePlan}
      />
      <AnimatePresence>
        {editor ? (
          <PlannedSessionModal
            key={`${PLANNER_BLOCK_KINDS.planned}:${editor.revision}`}
            snapshot={state.S}
            anchorDay={editor.anchorDay}
            plan={editor.plan}
            initialTaskId={editor.taskId}
            initialRange={editor.range}
            onClose={() => setEditor(null)}
            onSave={async (taskId, range) => { if (await planner.save(editor.plan, taskId, range)) setEditor(null); }}
          />
        ) : null}
        {recordEditor ? (
          <RecordSessionModal
            key={`${PLANNER_BLOCK_KINDS.actual}:${recordEditor.revision}`}
            snapshot={state.S}
            anchorDay={recordEditor.anchorDay}
            initialRange={recordEditor.range}
            onClose={() => setRecordEditor(null)}
            onSave={async (taskId, range) => { if (await planner.record(taskId, range)) setRecordEditor(null); }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
