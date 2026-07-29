import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useCore } from "./CoreProvider.jsx";
import { JOURNAL_VIEW_KEY, LIFE_AREA_VIEW_KEY, PLANNER_VIEW_KEY } from "../constants";

const RouteContext = createContext(null);

export function useRoute() {
  return useContext(RouteContext);
}

export function RouteProvider({ children }) {
  const { S } = useCore();

  const [activeListId, setActiveListId] = useState(null);
  const [view, setView] = useState("home");
  const [activeAreaKey, setActiveAreaKey] = useState(null);
  const [route, setRouteState] = useState({ view: "home", listId: null, areaKey: null });
  const [navBack, setNavBack] = useState([]);
  const [navFwd, setNavFwd] = useState([]);
  const [plannerTarget, setPlannerTarget] = useState(null);
  const [journalTarget, setJournalTarget] = useState(null);
  const navigationGuardRef = useRef(null);

  // Ensure activeListId is valid whenever S changes
  useEffect(() => {
    if (!S) return;
    setActiveListId((prev) => {
      if (!prev || !S.lists.find((l) => l.id === prev)) {
        return S.lists[0]?.id ?? null;
      }
      return prev;
    });
  }, [S]);

  const registerNavigationGuard = useCallback((guard) => {
    navigationGuardRef.current = guard;
    return () => {
      if (navigationGuardRef.current === guard) navigationGuardRef.current = null;
    };
  }, []);

  const canNavigate = useCallback(async (target) => {
    return navigationGuardRef.current ? navigationGuardRef.current(target) : true;
  }, []);

  const navigate = useCallback(async (target) => {
    if (!await canNavigate(target)) return false;
    const nextView = target.view || "tasks";
    const nextListId = target.listId || null;
    const nextAreaKey = target.areaKey || null;

    setNavBack((prev) => [...prev, { view, listId: activeListId, areaKey: activeAreaKey }]);
    setNavFwd([]);
    setView(nextView);
    setPlannerTarget(nextView === PLANNER_VIEW_KEY && target.planTaskId
      ? { taskId: target.planTaskId, planId: target.planSessionId || null }
      : null);
    setJournalTarget(nextView === JOURNAL_VIEW_KEY && target.journalEntryId
      ? { entryId: target.journalEntryId }
      : null);
    if (nextListId) {
      setActiveListId(nextListId);
    }
    setActiveAreaKey(nextView === LIFE_AREA_VIEW_KEY ? nextAreaKey : null);
    setRouteState({ view: nextView, listId: nextListId, areaKey: nextAreaKey });
    return true;
  }, [view, activeListId, activeAreaKey, canNavigate]);

  const goBack = useCallback(async () => {
    if (!navBack.length) return false;
    const previous = navBack[navBack.length - 1];
    if (!await canNavigate(previous)) return false;
    setNavBack(navBack.slice(0, -1));
    setNavFwd((current) => [...current, { view, listId: activeListId, areaKey: activeAreaKey }]);
    setView(previous.view);
    setActiveListId(previous.listId);
    setActiveAreaKey(previous.areaKey || null);
    setRouteState({ view: previous.view, listId: previous.listId, areaKey: previous.areaKey || null });
    setPlannerTarget(null);
    setJournalTarget(null);
    return true;
  }, [view, activeListId, activeAreaKey, navBack, canNavigate]);

  const goForward = useCallback(async () => {
    if (!navFwd.length) return false;
    const next = navFwd[navFwd.length - 1];
    if (!await canNavigate(next)) return false;
    setNavFwd(navFwd.slice(0, -1));
    setNavBack((current) => [...current, { view, listId: activeListId, areaKey: activeAreaKey }]);
    setView(next.view);
    setActiveListId(next.listId);
    setActiveAreaKey(next.areaKey || null);
    setRouteState({ view: next.view, listId: next.listId, areaKey: next.areaKey || null });
    setPlannerTarget(null);
    setJournalTarget(null);
    return true;
  }, [view, activeListId, activeAreaKey, navFwd, canNavigate]);

  const goHome = useCallback(() => {
    navigate({ view: "home" });
  }, [navigate]);

  const selectList = useCallback((id) => {
    return navigate({ view: "tasks", listId: id });
  }, [navigate]);

  const selectLifeArea = useCallback((areaKey) => {
    navigate({ view: LIFE_AREA_VIEW_KEY, areaKey });
  }, [navigate]);

  const clearPlannerTarget = useCallback(() => setPlannerTarget(null), []);
  const clearJournalTarget = useCallback(() => setJournalTarget(null), []);

  return (
    <RouteContext.Provider value={{
      state: { view, activeListId, activeAreaKey, route, navBack, navFwd, plannerTarget, journalTarget },
      actions: { navigate, goBack, goForward, goHome, selectList, selectLifeArea, clearPlannerTarget, clearJournalTarget, registerNavigationGuard }
    }}>
      {children}
    </RouteContext.Provider>
  );
}
