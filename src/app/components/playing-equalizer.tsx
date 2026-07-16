import React from "react";

export function PlayingEqualizer({ className = "", label = "Recording now" } = {}) {
  return (
    <span className={`playing-equalizer ${className}`} title={label} aria-label={label}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="3" y="9" width="3" height="12" rx="1.5" />
        <rect x="10.5" y="3" width="3" height="18" rx="1.5" />
        <rect x="18" y="7" width="3" height="14" rx="1.5" />
      </svg>
    </span>
  );
}

// Backward-compatible export
export const playingEqualizer = (props) => <PlayingEqualizer {...props} />;
