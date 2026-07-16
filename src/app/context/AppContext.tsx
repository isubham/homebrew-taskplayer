import { createContext, useContext, useMemo, useCallback } from "react";
import { CoreProvider, useCore } from "./CoreProvider.jsx";
import { RouteProvider, useRoute } from "./RouteProvider.jsx";
import { SettingsProvider, useSettings } from "./SettingsProvider.jsx";
import { UIProvider, useUI } from "./UIProvider.jsx";
import { PlaybackProvider, usePlayback } from "./PlaybackProvider.jsx";
import { DatabaseProvider, useDatabase } from "./DatabaseProvider.jsx";
import { KeyboardProvider, useKeyboard } from "./KeyboardProvider.jsx";

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

function AppContextComposer({ children }) {
  const core = useCore();
  const route = useRoute();
  const settings = useSettings();
  const ui = useUI();
  const playback = usePlayback();
  const database = useDatabase();
  const keyboard = useKeyboard();

  const activeList = useCallback(() => {
    return route.state.activeListId ? core.helpers.list(route.state.activeListId) : null;
  }, [core.helpers, route.state.activeListId]);

  const value = useMemo(() => ({
    state: {
      S: core.S,
      ...route.state,
      ...settings.state,
      ...ui.state,
      ...keyboard.state
    },
    helpers: {
      ...core.helpers,
      activeList
    },
    actions: {
      apply: core.apply,
      ...route.actions,
      ...settings.actions,
      ...ui.actions,
      ...playback.actions,
      ...database.actions
    },
    setSidebarCollapsed: settings.actions.setSidebarCollapsed,
    setLifeBalanceAgainst: settings.actions.setLifeBalanceAgainst,
    setKeybindings: settings.actions.setKeybindings,
    setOpenTaskId: ui.actions.setOpenTaskId,
    setOpenListId: ui.actions.setOpenListId,
    setOpenListArea: ui.actions.setOpenListArea,
    setLyricsId: ui.actions.setLyricsId,
    setOpenTrackDetail: ui.actions.setOpenTrackDetail,
    setSelectedAgainstArea: ui.actions.setSelectedAgainstArea,
    setSelectedGridCell: ui.actions.setSelectedGridCell,
    setInsightsPeriod: settings.actions.setInsightsPeriod,
    setSessionGroupsCollapsed: settings.actions.setSessionGroupsCollapsed,
    setDialogInput: ui.actions.setDialogInput,
    setDialogSession: ui.actions.setDialogSession,
  }), [core, route, settings, ui, playback, database, keyboard]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function AppProvider({ children }) {
  return (
    <CoreProvider>
      <RouteProvider>
        <SettingsProvider>
          <UIProvider>
            <PlaybackProvider>
              <DatabaseProvider>
                <KeyboardProvider>
                  <AppContextComposer>{children}</AppContextComposer>
                </KeyboardProvider>
              </DatabaseProvider>
            </PlaybackProvider>
          </UIProvider>
        </SettingsProvider>
      </RouteProvider>
    </CoreProvider>
  );
}
