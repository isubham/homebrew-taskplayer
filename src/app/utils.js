// The 7 axes of the Home page's life-balance radar chart (see
// lifeBalanceScores()/buildLifeRadar() in render.js). A list can be tagged
// with one of these `key`s (plus a direction, see commands.js's editList/
// addList) so its tracked time counts toward that axis — shared here so
// the "New list"/"Edit list" pickers and the radar's own labels can never
// drift out of sync with each other.
export const LIFE_AREAS = [
  { key: "career", label: "Career / Work" },
  { key: "health", label: "Health & Fitness" },
  { key: "relationships", label: "Relationships" },
  { key: "growth", label: "Personal Growth" },
  { key: "finance", label: "Finances" },
  { key: "recreation", label: "Recreation" },
  { key: "wellbeing", label: "Mental Wellbeing" },
];

// ---- Impact: a task's tier + direction, independent of tracked time ----
// This started as a much bigger system (per-task multi-area weighted
// splits, a daily "mana" capacity, decaying vitality rings, a rolling-window
// rank ladder). All of that got cut: it was more machinery than the one
// actual insight underneath it was worth. The insight that's kept — a
// 5-minute action can matter more than a 3-hour one, so time tracked and
// impact should be tracked separately — is captured by these two fields
// (`impactTier` + `impactSign`) alone. A task's *area* is no longer its own
// thing; it's simply whatever life area the task's list is already tagged
// with (see LIFE_AREAS / TaskList.lifeArea below), same as it was before
// any of this existed.

// Independent of `estimateMin` on purpose — a 5-minute task can be `severe`,
// a 2-hour one `low`. `weight` is the only number left driving anything
// (jewel payout, and the life-balance radar's weighting — see render.js).
// Deliberately NOT randomized: the payout for a given tier is always the
// same number, shown to the user before they commit, never a variable
// reward.
export const IMPACT_TIERS = {
  low: { label: "Low", weight: 1 },
  medium: { label: "Medium", weight: 2 },
  high: { label: "High", weight: 4 },
  severe: { label: "Severe", weight: 8 },
};
export const IMPACT_TIER_KEYS = ["low", "medium", "high", "severe"];

// Deterministic jewel payout for completing `task` — the exact number shown
// before the user commits (see render.js) and the same number used again
// once the task is actually marked done, so what's promised is always
// what's paid. Returns null for a task with no impact tier set (weightless,
// no jewel either way) — a plain { amount } otherwise, signed by the task's
// own for/against toggle.
export function jewelPayout(task) {
  const tier = IMPACT_TIERS[task.impactTier];
  if (!tier) return null;
  const sign = task.impactSign === -1 ? -1 : 1;
  return { amount: sign * tier.weight };
}

export function esc(s) {
  return String(s).replace(/[&<>\"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[char]));
}

// Albums are just a freeform name on a task — no color/emoji of their own is
// stored, so a deterministic hash of the name picks a stable tile color
// (same album always renders the same color, without a DB column for it).
const ALBUM_PALETTE = ["#509bf5", "#e8b923", "#8d67ab", "#e13300", "#27856a", "#e8115b", "#ba5d07", "#1db954"];
export function albumColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return ALBUM_PALETTE[Math.abs(hash) % ALBUM_PALETTE.length];
}

export function fmt(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function fmtLong(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${totalSeconds}s`;
}

export function whenLabel(ts) {
  const date = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now - 86400000);
  const sameDay = date.toDateString() === now.toDateString();
  const sameYesterday = date.toDateString() === yesterday.toDateString();
  const day = sameDay ? "Today" : sameYesterday ? "Yesterday" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${day} · ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

// "35m ago" / "Yesterday" / "3 days ago" style relative label, used by the
// Recent page (last-played time) instead of whenLabel's "Today · 3:45pm"
// format — recency, not the clock, is the point there.
export function timeAgo(ts, now = Date.now()) {
  const minutes = Math.floor(Math.max(0, now - ts) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtEst(min) {
  return parseFloat((min / 60).toFixed(2)) + "h";
}

export function fmtHM(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? (remainder ? `${hours}h ${remainder}m` : `${hours}h`) : `${minutes}m`;
}

export function estPct(task, taskTotal) {
  return task.estimateMin ? Math.min(100, Math.round(taskTotal(task.id) / (task.estimateMin * 60000) * 100)) : 0;
}

// Builds the "capacity bar" — the single fixed-width (160px) track that now
// carries everything: individual sessions as chips filling it (bringing back
// the very first segmented-bar sketch), the estimate boundary, and the
// numbers written directly ON the bar instead of as separate text beside it.
// Under the estimate, sessions sit at true scale as green chips and the bar
// just ends early; a centered white readout reads "spent │ estimate" (a thin
// tick stands in for the "/"). Once the total crosses the estimate, every
// chip rescales down to keep fitting the same fixed width, whichever
// session straddles the boundary splits into a green part and a red part,
// and the readout collapses to just the total plus a small "+Xh over" tag.
// Session count — no longer visible as individual chips once there are too
// many to read at a glance — also gets a small "×N" corner badge.
export function buildCapacityBar(durations, estimateMin, { trackPx = 160 } = {}) {
  if (!estimateMin) return null;
  const estimateMs = estimateMin * 60000;
  const total = durations.reduce((sum, d) => sum + d, 0);
  const over = total > estimateMs;
  const sessionCount = durations.length;
  const sessionLabel = `${sessionCount} session${sessionCount === 1 ? "" : "s"}`;

  let chips;
  if (!over) {
    const scale = estimateMs ? trackPx / estimateMs : 0;
    chips = durations.map((d) => `<i class="seg g" style="width:${Math.max(1.5, d * scale).toFixed(1)}px"></i>`).join("");
  } else {
    // Compress every session to fit the fixed track: split whichever one
    // straddles the estimate boundary into a green (before) part and a red
    // (after) part, then rescale everything by the new, larger total.
    let cum = 0;
    const parts = [];
    for (const d of durations) {
      const segStart = cum;
      const segEnd = cum + d;
      if (segEnd <= estimateMs) parts.push({ d, cls: "g" });
      else if (segStart >= estimateMs) parts.push({ d, cls: "r" });
      else {
        parts.push({ d: estimateMs - segStart, cls: "g" });
        parts.push({ d: segEnd - estimateMs, cls: "r" });
      }
      cum = segEnd;
    }
    const scale = trackPx / total;
    chips = parts.map((p) => `<i class="seg ${p.cls}" style="width:${Math.max(1.5, p.d * scale).toFixed(1)}px"></i>`).join("");
  }

  const title = over
    ? `${sessionLabel} · ${fmtHM(total)} of ${fmtEst(estimateMin)} · ${fmtHM(total - estimateMs)} over`
    : `${sessionLabel} · ${fmtHM(total)} of ${fmtEst(estimateMin)} · ${fmtHM(estimateMs - total)} left`;

  const readout = over
    ? `${fmtHM(total)}<span class="over-tag">+${fmtHM(total - estimateMs)} over</span>`
    : `${fmtHM(total)}<span class="sep"></span><span class="est-part">${fmtEst(estimateMin)}</span>`;

  const sessBadge = sessionCount ? `<span class="sess-badge" title="${sessionLabel}">×${sessionCount}</span>` : "";

  return {
    over,
    title,
    html: `<span class="capbar" title="${title}"><span class="chips">${chips}</span>${sessBadge}<span class="readout">${readout}</span></span>`,
  };
}
