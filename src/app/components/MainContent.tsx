import React from "react";
import "./main-content.css";
import { HomePage } from "./HomePage.jsx";
import { SettingsPage } from "./SettingsPage.jsx";
import { InsightsPage } from "./InsightsPage.jsx";
import { NowPlayingPage } from "./NowPlayingPage.jsx";
import { PlannerPage } from "./PlannerPage.jsx";
import { TaskListPage } from "./task-list-page.jsx";
import { AnimatedPage } from "./motion-transitions.jsx";
import { PLANNER_VIEW_KEY } from "../constants";

export function MainContent(props) {
  const { state, activeList, tasksForList, attentionTasks, dispatch } = props;

  if (!state.S) {
    return <div className="empty">Create a list to get started.</div>;
  }

  const renderView = () => {
    switch (state.view) {
      case "home":
        return <HomePage {...props} />;
      case "settings":
        return <SettingsPage state={state} dispatch={dispatch} />;
      case "insights":
        return <InsightsPage {...props} />;
      case PLANNER_VIEW_KEY:
        return <PlannerPage />;
      case "playing":
        return <NowPlayingPage {...props} />;
      default: {
        const listItem = activeList();
        if (!listItem) {
          return <div className="empty">Create a list to get started.</div>;
        }
        return (
          <TaskListPage
            state={state}
            listItem={listItem}
            all={tasksForList(listItem.id)}
            taskSessions={props.taskSessions}
            taskTotal={props.taskTotal}
            listTotal={props.listTotal}
            listEstimateTotal={props.listEstimateTotal}
            attentionTaskIds={new Set(attentionTasks().map((task) => task.id))}
          />
        );
      }
    }
  };

  const listItem = state.view !== "home" && state.view !== "settings" && state.view !== "insights" && state.view !== PLANNER_VIEW_KEY && state.view !== "playing"
    ? activeList()
    : null;
  const accentColor = listItem?.color || null;

  const accentStyles = accentColor ? {
    "--accent": accentColor,
    "--accent-soft": `${accentColor}88`,
    "--accent-softer": `${accentColor}22`,
  } : {};

  return (
    <main className="main" id="main" style={accentStyles}>
      <AnimatedPage viewKey={state.view + (listItem ? `-${listItem.id}` : "")}>
        {renderView()}
      </AnimatedPage>
    </main>
  );
}
