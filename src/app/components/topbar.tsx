import { BarChart2, ChevronLeft, ChevronRight } from "lucide-react";
import "./topbar.css";
import {
  SESSIONS_PAGE_COPY,
  TOPBAR_ACTION_ICON_SIZE,
  TOPBAR_HISTORY_ICON_SIZE,
} from "../constants";
import { useApp } from "../context/app-context-value";
import { TopbarSearch } from "./topbar-search";

export function Topbar({ state, list, activeView }) {
  const { actions } = useApp();

  return (
    <div className="topbar" data-tauri-drag-region>
      <div className="topbar-content" data-tauri-drag-region>
      <div className="topbar-left">
        <button
          id="navback"
          className="topbar-navbtn"
          onClick={actions.goBack}
          title="Back (⌘[)"
          disabled={!state.navBack?.length}
        >
          <ChevronLeft size={TOPBAR_HISTORY_ICON_SIZE} aria-hidden="true" />
        </button>
        <button
          id="navfwd"
          className="topbar-navbtn"
          onClick={actions.goForward}
          title="Forward (⌘])"
          disabled={!state.navFwd?.length}
        >
          <ChevronRight size={TOPBAR_HISTORY_ICON_SIZE} aria-hidden="true" />
        </button>
      </div>
      <div className="topbar-center">
        <button id="tbhome" className={`topbar-navbtn ${activeView === "home" ? "active" : ""}`} onClick={actions.goHome} title="Home">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" /></svg>
        </button>
        <TopbarSearch state={state} list={list} />
      </div>
      <div className="topbar-right">
        <div className="topbar-icons" id="topbarIcons">
          <button
            data-tour-id="insights-nav"
            className={activeView === "insights" ? "active" : ""}
            onClick={() => actions.navigate({ view: "insights" })}
            title={SESSIONS_PAGE_COPY.navigationTitle}
          >
            <BarChart2 size={TOPBAR_ACTION_ICON_SIZE} aria-hidden="true" />
          </button>
          <button
            id="topbarSettings"
            className={activeView === "settings" ? "active" : ""}
            onClick={() => actions.navigate({ view: "settings" })}
            title="Settings"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

// Backward-compatible export
export const topbar = (props) => <Topbar {...props} />;
