import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { LoaderCircle, WandSparkles } from "lucide-react";
import { commands, type AutomaticPlanPreview } from "../../bindings";
import {
  AUTOMATIC_PLAN_COPY,
  AUTOMATIC_PLAN_FALLBACK_TIME_ZONE,
  PLANNER_COPY,
  PLANNER_ICON_SIZE,
} from "../../constants";
import { useApp } from "../../context/AppContext";
import { esc } from "../../utils";
import { AutomaticPlanModal } from "./automatic-plan-modal";

const localTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || AUTOMATIC_PLAN_FALLBACK_TIME_ZONE;

export function AutomaticPlannerControl() {
  const { state, actions } = useApp();
  const [preview, setPreview] = useState<AutomaticPlanPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const showError = async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    await actions.uiNote(
      AUTOMATIC_PLAN_COPY.commandErrorTitle,
      esc(message),
      PLANNER_COPY.dismissButton,
    );
  };

  const load = async () => {
    setBusy(true);
    try {
      const result = await commands.suggestAutomaticPlan(localTimeZone());
      if (result.status === "error") await showError(result.error);
      else setPreview(result.data);
    } catch (error) {
      await showError(error);
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await commands.acceptAutomaticPlan(localTimeZone(), preview);
      if (result.status === "error") await showError(result.error);
      else {
        actions.apply(result.data);
        setPreview(null);
      }
    } catch (error) {
      await showError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="btn planner-auto-plan"
        type="button"
        title={AUTOMATIC_PLAN_COPY.buttonTitle}
        disabled={busy}
        onClick={load}
      >
        {busy && !preview
          ? <LoaderCircle className="automatic-plan-spinner" size={PLANNER_ICON_SIZE} />
          : <WandSparkles size={PLANNER_ICON_SIZE} />}
        {busy && !preview ? AUTOMATIC_PLAN_COPY.loadingButton : AUTOMATIC_PLAN_COPY.button}
      </button>
      <AnimatePresence>
        {preview ? (
          <AutomaticPlanModal
            snapshot={state.S}
            preview={preview}
            busy={busy}
            onClose={() => setPreview(null)}
            onRefresh={load}
            onAccept={accept}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
