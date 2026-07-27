import React from "react";
import { SESSIONS_PAGE_COPY } from "../constants.jsx";

const insightsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

export function PinnedNav({ activeView }) {
  return (
    <div className={`list-item ${activeView === "insights" ? "active" : ""}`} data-action="openInsightsPage" title={SESSIONS_PAGE_COPY.navigationTitle}>
      <span className="li-icon">{insightsIcon()}</span>
      <span className="li-label">{SESSIONS_PAGE_COPY.label}</span>
    </div>
  );
}

// Backward-compatible export
export const pinnedNav = (props) => <PinnedNav {...props} />;
