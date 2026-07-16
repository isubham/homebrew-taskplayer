import React from "react";
import _ from "lodash";
import { Topbar } from "./components/topbar.jsx";
import { Sidebar, SidebarListRow } from "./components/sidebar.jsx";
import { MainContent } from "./components/MainContent.jsx";
import { Player } from "./components/Player.jsx";
import { Overlays } from "./components/Overlays.jsx";
import { AddSessionModal } from "./components/add-session-modal.jsx";
import { useApp } from "./context/AppContext.jsx";
import { fmt } from "./utils.jsx";
import { SIDEBAR_COPY } from "./constants.jsx";
import { AnimatePresence } from "motion/react";
import { AnimatedModal, AnimatedSpinner, AnimatedToast, AnimatedContextMenu } from "./components/motion-transitions.jsx";
import { DragDropContext } from "@hello-pangea/dnd";
import { BarChart2, RefreshCw, ChevronsDown, ChevronsUp } from "lucide-react";

import { useTauriSubscriptions } from "./hooks/use-tauri-subscriptions.jsx";
import { useSidebarSections } from "./hooks/use-sidebar-sections.jsx";
import { useAppDragAndDrop } from "./hooks/use-app-drag-and-drop.jsx";

export function App() {
  const { state, helpers, actions, setSidebarCollapsed, setDialogInput } = useApp();

  useTauriSubscriptions(actions.apply, actions.checkForUpdates);
  const sections = useSidebarSections(state);
  const handleDragEnd = useAppDragAndDrop(state, helpers, actions, sections);

  if (!state.S) {
    return <div className="focus-empty">Loading your tasks...</div>;
  }

  const anyCollapsed = sections.some((section) => state.sidebarCollapsed[section.key]);
  const toggleAllTitle = anyCollapsed ? "Expand all list sections" : "Collapse all list sections";
  const attentionIds = new Set(helpers.attentionTasks().map((task) => task.id));

  const sidebarListRowForState = (listItem) => {
    const count = helpers.tasksForList(listItem.id).length;
    const liveTask = state.S.run.activeTaskId && state.S.run.phase === "work" && state.S.run.runningStart
      ? helpers.findTask(state.S.run.activeTaskId) : null;
    const isPlaying = liveTask?.listId === listItem.id;
    const detail = `${isPlaying ? "Recording now · " : ""}${count} task${count === 1 ? "" : "s"} · ${helpers.listTotal(listItem.id) ? fmt(helpers.listTotal(listItem.id)) : "0m"} of ${helpers.listEstimateTotal(listItem.id) ? helpers.listEstimateTotal(listItem.id) + "h" : "0h"}`;
    const playingTask = state.view === "playing" ? helpers.nowPlayingSelection() : null;
    const isActive = (state.view === "tasks" && listItem.id === state.activeListId)
      || (state.view === "playing" && playingTask?.listId === listItem.id);
    const attention = helpers.tasksForList(listItem.id).some((task) => attentionIds.has(task.id));

    return (
      <SidebarListRow
        key={listItem.id}
        listItem={listItem}
        detail={detail}
        active={isActive}
        playing={isPlaying}
        attention={attention}
        onClick={() => actions.selectList(listItem.id)}
      />
    );
  };

  const handleToggleAllAreaSections = () => {
    setSidebarCollapsed(() => {
      const next = {};
      sections.forEach((section) => next[section.key] = !anyCollapsed);
      localStorage.setItem("tp.sidebarCollapsed", JSON.stringify(next));
      return next;
    });
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div id="app">
        <Topbar state={state} list={helpers.list} activeView={state.view} />
        <aside className="side">
          <div className="side-fixed">
            <div id="pinnedNav">
              <div className={`list-item ${state.view === "insights" ? "active" : ""}`} onClick={() => actions.navigate({ view: "insights" })} title="Session history & analytics">
                <span className="li-icon"><BarChart2 size={15} /></span>
                <span className="li-label">Insights</span>
              </div>
            </div>
            <div className="side-lists-heading">
              <div className="side-lists-title">
                <h3>{SIDEBAR_COPY.lifeAreasHeading}</h3>
                {state.S?.syncing && (
                  <AnimatedSpinner title="Syncing data...">
                    <RefreshCw size={12} strokeWidth={3} />
                  </AnimatedSpinner>
                )}
              </div>
              <div className="side-lists-actions">
                <button id="sidebarToggleAll" className="side-toggle-all" onClick={handleToggleAllAreaSections} title={toggleAllTitle}>
                  {anyCollapsed ? <ChevronsDown size={16} /> : <ChevronsUp size={16} />}
                </button>
              </div>
            </div>
          </div>
          <div className="side-scroll">
            <div id="lists">
              <Sidebar sections={sections} collapsed={state.sidebarCollapsed} rowForList={sidebarListRowForState} />
            </div>
          </div>
          <button className="add-btn" onClick={() => actions.addList()}>＋ New list</button>
        </aside>

        <input type="file" id="importFile" accept=".json,application/json" style={{ display: "none" }} />
        
        <MainContent
          state={state}
          activeList={helpers.activeList}
          list={helpers.list}
          findTask={helpers.findTask}
          tasksForList={helpers.tasksForList}
          taskSessions={helpers.taskSessions}
          taskTotal={helpers.taskTotal}
          listTotal={helpers.listTotal}
          listEstimateTotal={helpers.listEstimateTotal}
          attentionTasks={helpers.attentionTasks}
          recentTasks={helpers.recentTasks}
          dailyJamTasks={helpers.dailyJamTasks}
          todayTotalMs={helpers.todayTotalMs}
          todayJewels={helpers.todayJewels}
          lifetimeJewelsNet={helpers.lifetimeJewelsNet}
          lifeBalanceScores={helpers.lifeBalanceScores}
          lifeBalanceDailyGrid={helpers.lifeBalanceDailyGrid}
          againstContributors={helpers.againstContributors}
          buildRankInfo={helpers.buildRankInfo}
          LIFE_BALANCE_DAILY_CAP_MS={8 * 60 * 60 * 1000}
          dispatch={null}
        />
        <Player state={state} setTrackDetailOpen={actions.setOpenTrackDetail} />
        <Overlays
          state={state}
          list={helpers.list}
          findTask={helpers.findTask}
          taskSessions={helpers.taskSessions}
          taskTotal={helpers.taskTotal}
          trackDetailOpen={state.openTrackDetail}
          dispatch={null}
        />

        <AnimatePresence>
          {state.dialog?.type === "session" && <AddSessionModal key="session-dialog" />}
        </AnimatePresence>

        <AnimatePresence>
          {state.dialog && state.dialog.type !== "session" && (
            <AnimatedModal id="dmodal" className="modal dlg show" overlayClassName="overlay show" onClose={() => actions.resolveDialog(null)}>
              <div className="dtitle">{state.dialog.title}</div>
              <div className="dbody">
                {state.dialog.type === "prompt" && <input className="dinput" value={state.dialogInput || ""} onChange={(e) => setDialogInput(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") actions.resolveDialog(state.dialogInput); }} />}
                {state.dialog.type === "album" && <input className="dinput" value={state.dialogInput || ""} onChange={(e) => setDialogInput(e.target.value)} placeholder="Singles" autoFocus onKeyDown={(e) => { if (e.key === "Enter") actions.resolveDialog(state.dialogInput); }} />}
                {state.dialog.type === "lyrics" && <textarea className="dtextarea" style={{ height: "250px", fontFamily: "inherit" }} value={state.dialogInput || ""} onChange={(e) => setDialogInput(e.target.value)} autoFocus />}
                {(state.dialog.type === "confirm" || state.dialog.type === "note") && (state.dialog.messageHtml ? <div dangerouslySetInnerHTML={{ __html: state.dialog.messageHtml }} /> : <div className="dbody">{state.dialog.message}</div>)}
              </div>
              <div className="dfoot">
                <button className="btn" id="dcancel" onClick={() => actions.resolveDialog(null)}>Cancel</button>
                <button className={`btn ${state.dialog.danger ? "danger" : "primary"}`} id="dok" onClick={() => { const value = ["prompt", "album", "lyrics"].includes(state.dialog.type) ? state.dialogInput : true; actions.resolveDialog(value); }}>{state.dialog.confirmText}</button>
              </div>
            </AnimatedModal>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {state.toast && (
            <AnimatedToast className={`app-toast-host show toast toast-${state.toast.tone}`}>
              <div className={`app-toast-card ${state.toast.tone}`}>
                {state.toast.title && <strong>{state.toast.title}</strong>}
                <span>{state.toast.message}</span>
              </div>
            </AnimatedToast>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {state.activeMenuTaskId && (
            <AnimatedContextMenu id="popmenu" className="popmenu show" style={{ left: state.menuPosition.left, top: state.menuPosition.top }}>
              <button onClick={() => { actions.closeRowMenu(); actions.toggleDone(state.activeMenuTaskId); }}>
                {helpers.findTask(state.activeMenuTaskId)?.completedAt ? "↩\u00a0 Mark as not done" : "✓\u00a0 Mark as done"}
              </button>
              <button onClick={() => { actions.closeRowMenu(); actions.setOpenTaskId(state.activeMenuTaskId); }}>Edit</button>
              <button onClick={() => { actions.closeRowMenu(); actions.play(state.activeMenuTaskId); }}>
                {state.S.run.activeTaskId === state.activeMenuTaskId && state.S.run.phase ? "⏸ Stop timer" : "▶ Start timer"}
              </button>
              <div className="sep"></div>
              <button onClick={() => { actions.closeRowMenu(); actions.setAlbum(state.activeMenuTaskId); }}>
                💿 {helpers.findTask(state.activeMenuTaskId)?.album ? `Change album (${helpers.findTask(state.activeMenuTaskId).album})` : "Set album…"}
              </button>
              <div className="sep"></div>
              <button className="danger" onClick={() => { actions.closeRowMenu(); actions.deleteTask(state.activeMenuTaskId); }}>Delete task</button>
            </AnimatedContextMenu>
          )}
        </AnimatePresence>
      </div>
    </DragDropContext>
  );
}
