import React, { useState, useEffect } from "react";
import { BarChart2, ChevronLeft, ChevronRight } from "lucide-react";
import "./topbar.css";
import { SESSIONS_PAGE_COPY, TOPBAR_ACTION_ICON_SIZE, TOPBAR_HISTORY_ICON_SIZE } from "../constants";
import { useApp } from "../context/app-context-value";

export function Topbar({ state, list, activeView }) {
  const { actions } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      const wrap = document.getElementById("topbarSearchWrap");
      if (wrap && !wrap.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowResults(value.trim() !== "");
  };

  const getSearchResults = () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !state.S) return { listMatches: [], taskMatches: [] };
    const listMatches = state.S.lists.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 4);
    const taskMatches = state.S.tasks
      .filter((t) => !t.completedAt && t.name.toLowerCase().includes(q))
      .slice(0, 8);
    return { listMatches, taskMatches };
  };

  const { listMatches, taskMatches } = getSearchResults();

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
        <div className="topbar-search" id="topbarSearchWrap" style={{ position: "relative" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            id="topbarSearch"
            type="text"
            placeholder="Search tasks and lists"
            autoComplete="off"
            spellCheck="false"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => searchQuery.trim() !== "" && setShowResults(true)}
          />
          {showResults && (
            <div className="search-results show" id="searchResults">
              {!listMatches.length && !taskMatches.length ? (
                <div className="sr-empty">No matches for "{searchQuery}"</div>
              ) : (
                <>
                  {listMatches.map((l) => (
                    <div
                      key={l.id}
                      className="sr-item"
                      onClick={() => {
                        setSearchQuery("");
                        setShowResults(false);
                        actions.selectList(l.id);
                      }}
                    >
                      <span>{l.emoji}</span>
                      <span className="sr-name">{l.name}</span>
                      <span className="sr-meta">list</span>
                    </div>
                  ))}
                  {taskMatches.map((t) => {
                    const li = list(t.listId);
                    return (
                      <div
                        key={t.id}
                        className="sr-item"
                        onClick={() => {
                          setSearchQuery("");
                          setShowResults(false);
                          actions.selectList(t.listId);
                          actions.setOpenTaskId(t.id);
                        }}
                      >
                        <span>{li ? li.emoji : "•"}</span>
                        <span className="sr-name">{t.name}</span>
                        <span className="sr-meta">{li ? li.name : ""}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
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
