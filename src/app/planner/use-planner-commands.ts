import { useCallback } from "react";
import { commands, type PlannedSession, type Snapshot } from "../bindings";
import { PLANNER_COPY, SESSION_COPY } from "../constants";
import { esc } from "../utils";

type PlannerActions = {
  apply: (snapshot: Snapshot) => void;
  uiConfirm: (title: string, message: string, confirmText: string) => Promise<boolean>;
  uiNote: (title: string, message: string, confirmText: string) => Promise<unknown>;
};

type SessionRange = { start: number; end: number };

export function usePlannerCommands(actions: PlannerActions) {
  const run = useCallback(async (command: ReturnType<typeof commands.createPlannedSession>) => {
    try {
      const result = await command;
      if (result.status === "error") {
        await actions.uiNote(PLANNER_COPY.commandErrorTitle, esc(String(result.error)), PLANNER_COPY.dismissButton);
        return false;
      }
      actions.apply(result.data);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await actions.uiNote(PLANNER_COPY.commandErrorTitle, esc(message), PLANNER_COPY.dismissButton);
      return false;
    }
  }, [actions]);

  const save = useCallback((plan: PlannedSession | null | undefined, taskId: string, range: SessionRange) =>
    run(plan
      ? commands.updatePlannedSession(plan.id, taskId, range.start, range.end)
      : commands.createPlannedSession(taskId, range.start, range.end)), [run]);

  const remove = useCallback(async (plan: PlannedSession) => {
    const confirmed = await actions.uiConfirm(
      PLANNER_COPY.removeTitle,
      PLANNER_COPY.removeDescription,
      PLANNER_COPY.removeConfirm,
    );
    return confirmed ? run(commands.deletePlannedSession(plan.id)) : false;
  }, [actions, run]);

  const start = useCallback((plan: PlannedSession) => run(commands.startPlannedSession(plan.id)), [run]);

  const record = useCallback(async (taskId: string, range: SessionRange) => {
    try {
      const result = await commands.addSession(taskId, range.start, range.end);
      if (result.status === "error") {
        await actions.uiNote(SESSION_COPY.commandErrorTitle, esc(String(result.error)), PLANNER_COPY.dismissButton);
        return false;
      }
      actions.apply(result.data);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await actions.uiNote(SESSION_COPY.commandErrorTitle, esc(message), PLANNER_COPY.dismissButton);
      return false;
    }
  }, [actions]);

  return { save, remove, start, record };
}
