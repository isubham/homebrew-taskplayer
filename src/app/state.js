export function createAppState() {
  const state = {
    S: null,
    activeListId: null,
    view: "tasks",
    completedOpen: false,
    railOpen: (localStorage.getItem("tp.rail") ?? "1") === "1",
    route: { view: "tasks", listId: null },
    navBack: [],
    navFwd: [],
    openTaskId: null,
    lyricsId: null,
    lastPhase: null,
    lastTaskId: null,
    // Most recent window.Music.snapshot(), cached here so the track-details
    // modal (opened by a click, not a music state push) has something to
    // render from at any time.
    lastMusic: null,
    // Self-update (Settings > About) — purely transient UI state, same as
    // the fields above. `updateInfo` holds the last `{version, notes}` a
    // check found (cleared once installed or dismissed by re-checking).
    checkingForUpdate: false,
    installingUpdate: false,
    updateInfo: null,
    // Populated once at startup from the `sound_options` command (see
    // main.js) — the Settings sound pickers render from this instead of a
    // hardcoded list, so they can never drift out of sync with what the
    // Rust side (the actual source of truth — see SOUND_OPTIONS in main.rs)
    // will accept.
    soundOptions: [],
  };

  const list = (id) => state.S?.lists.find((item) => item.id === id);
  const activeList = () => list(state.activeListId) || state.S?.lists[0];
  const findTask = (id) => state.S?.tasks.find((task) => task.id === id);
  const tasksForList = (lid) => state.S?.tasks.filter((task) => task.listId === lid) || [];
  const taskSessions = (id) => state.S?.sessions.filter((session) => session.taskId === id) || [];

  state.setSnapshot = (snap) => {
    state.S = snap;
    if (!state.activeListId || !list(state.activeListId)) {
      state.activeListId = state.S?.lists[0]?.id ?? null;
    }
    if (state.route.view === "tasks" && state.route.listId && !list(state.route.listId)) {
      state.route.listId = state.activeListId;
    }
    return state;
  };

  state.setRoute = (view, listId = null) => {
    state.route = { view, listId: listId || null };
    state.view = view;
    if (view === "tasks" && state.activeListId && !list(state.activeListId)) {
      state.activeListId = state.S?.lists[0]?.id ?? null;
    }
    return state.route;
  };

  function taskTotal(id) {
    const now = Date.now();
    let ms = taskSessions(id).reduce((sum, session) => sum + ((session.end ?? now) - session.start), 0);
    const run = state.S?.run;
    if (run?.activeTaskId === id && run.phase === "work" && run.runningStart) {
      ms += now - run.runningStart;
    }
    return ms;
  }

  const listTotal = (lid) => tasksForList(lid).reduce((sum, task) => sum + taskTotal(task.id), 0);
  // Sum of every task's own estimate (minutes) in a list — the "artist"-level
  // counterpart to a single task's estimateMin, shown alongside listTotal
  // wherever a list's total tracked time is displayed.
  const listEstimateTotal = (lid) => tasksForList(lid).reduce((sum, task) => sum + (task.estimateMin || 0), 0);
  const targetMs = () => {
    const config = state.S?.config;
    if (!config) return null;
    return config.mode === "target"
      ? config.targetMin * 60000
      : config.mode === "pomodoro"
        ? config.workMin * 60000
        : null;
  };

  const modeLabel = () => {
    const config = state.S?.config;
    if (!config) return "∞ Open";
    return config.mode === "target"
      ? `🎯 ${config.targetMin}m target`
      : config.mode === "pomodoro"
        ? `🍅 ${config.workMin}/${config.breakMin}`
        : "∞ Open";
  };

  const modeGlyph = () => {
    const mode = state.S?.config?.mode;
    return mode === "target" ? "◎" : mode === "pomodoro" ? "◔" : "∞";
  };

  return {
    state,
    list,
    activeList,
    findTask,
    tasksForList,
    taskSessions,
    taskTotal,
    listTotal,
    listEstimateTotal,
    targetMs,
    modeLabel,
    modeGlyph,
  };
}
