import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useCore } from "./CoreProvider.jsx";
import { LIFE_AREA_VIEW_KEY, PLANNER_VIEW_KEY } from "../constants";

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

  const navigate = useCallback((target) => {
    const nextView = target.view || "tasks";
    const nextListId = target.listId || null;
    const nextAreaKey = target.areaKey || null;

    setNavBack((prev) => [...prev, { view, listId: activeListId, areaKey: activeAreaKey }]);
    setNavFwd([]);
    setView(nextView);
    setPlannerTarget(nextView === PLANNER_VIEW_KEY && target.planTaskId
      ? { taskId: target.planTaskId, planId: target.planSessionId || null }
      : null);
    if (nextListId) {
      setActiveListId(nextListId);
    }
    setActiveAreaKey(nextView === LIFE_AREA_VIEW_KEY ? nextAreaKey : null);
    setRouteState({ view: nextView, listId: nextListId, areaKey: nextAreaKey });
  }, [view, activeListId, activeAreaKey]);

  const goBack = useCallback(() => {
    setNavBack((prevBack) => {
      if (!prevBack.length) return prevBack;
      const nextBack = [...prevBack];
      const prev = nextBack.pop();
      setNavFwd((prevFwd) => [...prevFwd, { view, listId: activeListId, areaKey: activeAreaKey }]);
      setView(prev.view);
      setActiveListId(prev.listId);
      setActiveAreaKey(prev.areaKey || null);
      setRouteState({ view: prev.view, listId: prev.listId, areaKey: prev.areaKey || null });
      setPlannerTarget(null);
      return nextBack;
    });
  }, [view, activeListId, activeAreaKey]);

  const goForward = useCallback(() => {
    setNavFwd((prevFwd) => {
      if (!prevFwd.length) return prevFwd;
      const nextFwd = [...prevFwd];
      const next = nextFwd.pop();
      setNavBack((prevBack) => [...prevBack, { view, listId: activeListId, areaKey: activeAreaKey }]);
      setView(next.view);
      setActiveListId(next.listId);
      setActiveAreaKey(next.areaKey || null);
      setRouteState({ view: next.view, listId: next.listId, areaKey: next.areaKey || null });
      setPlannerTarget(null);
      return nextFwd;
    });
  }, [view, activeListId, activeAreaKey]);

  const goHome = useCallback(() => {
    navigate({ view: "home" });
  }, [navigate]);

  const selectList = useCallback((id) => {
    setActiveListId(id);
    navigate({ view: "tasks", listId: id });
  }, [navigate]);

  const selectLifeArea = useCallback((areaKey) => {
    navigate({ view: LIFE_AREA_VIEW_KEY, areaKey });
  }, [navigate]);

  const clearPlannerTarget = useCallback(() => setPlannerTarget(null), []);

  return (
    <RouteContext.Provider value={{
      state: { view, activeListId, activeAreaKey, route, navBack, navFwd, plannerTarget },
      actions: { navigate, goBack, goForward, goHome, selectList, selectLifeArea, clearPlannerTarget }
    }}>
      {children}
    </RouteContext.Provider>
  );
}
