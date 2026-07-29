import { useEffect, useRef } from "react";
import { JOURNAL_VIEW_KEY } from "../../constants";
import { useRoute } from "../../context/RouteProvider";

export function useJournalNavigationGuard(dirty: boolean, saveBeforeLeaving: () => Promise<boolean>) {
  const { actions: { registerNavigationGuard } } = useRoute();
  const dirtyRef = useRef(dirty);
  const saveRef = useRef(saveBeforeLeaving);
  const pendingSaveRef = useRef<Promise<boolean> | null>(null);
  dirtyRef.current = dirty;
  saveRef.current = saveBeforeLeaving;

  useEffect(() => registerNavigationGuard(async (target) => {
    if (!dirtyRef.current) return true;
    if (target.view === JOURNAL_VIEW_KEY && !target.journalEntryId) return true;
    pendingSaveRef.current ||= saveRef.current();
    const saved = await pendingSaveRef.current;
    pendingSaveRef.current = null;
    return saved;
  }), [registerNavigationGuard]);
}
