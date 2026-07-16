import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useCore } from "./CoreProvider.jsx";

const RouteContext = createContext(null);

export function useRoute() {
  return useContext(RouteContext);
}

export function RouteProvider({ children }) {
  const { S } = useCore();

  const [activeListId, setActiveListId] = useState(null);
  const [view, setView] = useState("home");
  const [route, setRouteState] = useState({ view: "home", listId: null });
  const [navBack, setNavBack] = useState([]);
  const [navFwd, setNavFwd] = useState([]);

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

    setNavBack((prev) => [...prev, { view, listId: activeListId }]);
    setNavFwd([]);
    setView(nextView);
    if (nextListId) {
      setActiveListId(nextListId);
    }
    setRouteState({ view: nextView, listId: nextListId });
  }, [view, activeListId]);

  const goBack = useCallback(() => {
    setNavBack((prevBack) => {
      if (!prevBack.length) return prevBack;
      const nextBack = [...prevBack];
      const prev = nextBack.pop();
      setNavFwd((prevFwd) => [...prevFwd, { view, listId: activeListId }]);
      setView(prev.view);
      setActiveListId(prev.listId);
      setRouteState({ view: prev.view, listId: prev.listId });
      return nextBack;
    });
  }, [view, activeListId]);

  const goForward = useCallback(() => {
    setNavFwd((prevFwd) => {
      if (!prevFwd.length) return prevFwd;
      const nextFwd = [...prevFwd];
      const next = nextFwd.pop();
      setNavBack((prevBack) => [...prevBack, { view, listId: activeListId }]);
      setView(next.view);
      setActiveListId(next.listId);
      setRouteState({ view: next.view, listId: next.listId });
      return nextFwd;
    });
  }, [view, activeListId]);

  const goHome = useCallback(() => {
    navigate({ view: "home" });
  }, [navigate]);

  const selectList = useCallback((id) => {
    setActiveListId(id);
    navigate({ view: "tasks", listId: id });
  }, [navigate]);

  return (
    <RouteContext.Provider value={{
      state: { view, activeListId, route, navBack, navFwd },
      actions: { navigate, goBack, goForward, goHome, selectList }
    }}>
      {children}
    </RouteContext.Provider>
  );
}
