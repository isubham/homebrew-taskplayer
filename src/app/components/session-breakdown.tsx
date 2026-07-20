import { SESSION_BREAKDOWN_MIN_SPAN_MS, SESSION_BREAKDOWN_PERCENT_MAX, SESSION_PLAYBACK_COPY } from "../constants";
import { fmtLong } from "../utils";

type SessionBreakdownProps = {
  focusMs: number;
  breakMs: number;
  compact?: boolean;
};

export function SessionBreakdown({ focusMs, breakMs, compact = false }: SessionBreakdownProps) {
  const span = Math.max(SESSION_BREAKDOWN_MIN_SPAN_MS, focusMs + breakMs);
  const focusPercent = Math.min(
    SESSION_BREAKDOWN_PERCENT_MAX,
    Math.max(0, focusMs / span * SESSION_BREAKDOWN_PERCENT_MAX),
  );
  return (
    <div className={`session-breakdown${compact ? " compact" : ""}`}>
      <div
        className="session-breakdown-bar"
        role="img"
        aria-label={SESSION_PLAYBACK_COPY.breakdownLabel(fmtLong(focusMs), fmtLong(breakMs))}
      >
        <span className="focus" style={{ width: `${focusPercent}%` }} />
        <span className="break" style={{ width: `${SESSION_BREAKDOWN_PERCENT_MAX - focusPercent}%` }} />
      </div>
      <div className="session-breakdown-copy">
        <span>{SESSION_PLAYBACK_COPY.focusLabel} {fmtLong(focusMs)}</span>
        <span>{SESSION_PLAYBACK_COPY.breakLabel} {fmtLong(breakMs)}</span>
      </div>
    </div>
  );
}
