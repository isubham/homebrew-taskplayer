import { 
  UNTAGGED_LIST_COLOR, 
  IMPACT_TIERS, 
  IMPACT_TIER_KEYS, 
  RANKS, 
  RANK_AREA_CAP_RATIO,
  ALBUM_PALETTE
} from "./constants.jsx";

export { 
  UNTAGGED_LIST_COLOR, 
  IMPACT_TIERS, 
  IMPACT_TIER_KEYS, 
  RANKS, 
  RANK_AREA_CAP_RATIO 
};

// The 5 axes of the Home page's life-balance radar chart (see
// lifeBalanceScores()/buildLifeRadar() in render.js). A list can be tagged
// with one of these `key`s (plus a direction, see commands.js's editList/
// addList) so its tracked time counts toward that axis — shared here so
// the "New list"/"Edit list" pickers and the radar's own labels can never
// drift out of sync with each other.
//
// `color` is the area's own fixed identity — distinct from a list's own
// color (a list keeps whatever color it always had; several differently
// colored lists can feed the same area). Only buildLifeBalanceGrid() (see
// render.js) needs this: a grid keyed by area needs one stable color per
// row regardless of which list contributed on a given day, whereas the
// segmented bars deliberately use each contributor's own list color,
// since there the identity that matters is "which task," not "which
// area." Pulled from ALBUM_PALETTE below rather than a new palette, so
// area colors stay in the same family as the rest of the app's color
// language instead of introducing a second one.
export const LIFE_AREAS = [
  { key: "career", label: "Career / Work", color: "#509bf5" },
  // Health & Wellbeing merges the former separate "Health & Fitness" and
  // "Mental Wellbeing" areas — physical and mental health as one axis. Keeps
  // the "health" key so already-tagged lists need no change; lists tagged
  // with the retired "wellbeing" key are remapped to "health" by migration
  // 010 (see migrations.rs). Retains health's teal-green so the axis
  // identity (and its radar colour) carries over rather than jumping to a
  // new hue — updated from Spotify's exact brand green to the app's new
  // calm teal accent (see styles.css's --green), same hue family.
  { key: "health", label: "Health & Wellbeing", color: "#2f9e8f" },
  { key: "relationships", label: "Relationships", color: "#e8115b" },
  { key: "finance", label: "Finances", color: "#e8b923" },
  { key: "recreation", label: "Recreation", color: "#ba5d07" },
];

// A list's color is derived from its life area, not chosen independently —
// every list tagged to the same area renders the same color, so the color
// itself carries category identity instead of being a free personalization
// choice that can drift from (or contradict) the tag. Untagged ("Unsorted")
// lists get a fixed neutral gray rather than a rotating palette pick, since
// there's no category to derive from — visibly desaturated against every
// LIFE_AREAS hue, reading as "uncategorized" rather than an arbitrary color.

export function colorForArea(areaKey) {
  if (!areaKey) return UNTAGGED_LIST_COLOR;
  const area = LIFE_AREAS.find((a) => a.key === areaKey);
  return area ? area.color : UNTAGGED_LIST_COLOR;
}

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

// Independent of `estimateMin` on purpose — a 5-minute task can be `high`,
// a 2-hour one `low`. `weight` is the only number left driving anything
// (jewel payout, and the life-balance radar's weighting — see render.js).
// Deliberately NOT randomized: the payout for a given tier is always the
// same number, shown to the user before they commit, never a variable
// reward.


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

// ---- Rank progression (Home page badge) ----
// Six tiers off cumulative lifetime jewels — musical dynamics markings
// rather than a generic "level 1/2/3", to stay inside the same vocabulary
// as the rest of the app (Now Playing, tracks, jewels). `min` thresholds
// are fixed and disclosed (see the rank badge's tooltip in render.js) —
// never randomized, same discipline as IMPACT_TIERS above. Rank only ever
// climbs: it's computed fresh from lifetime *positive* jewels only (see
// render.js's lifetimeJewelsByArea/buildRankInfo), so an against-tagged
// task's negative jewels can never pull it back down — a rank demotion
// would be a Loss & Avoidance mechanic, which CLAUDE.md's gamification
// section rules out entirely for this app.


// Rank is computed from a "balanced" jewel total, not the raw sum: no
// single life area (or the "other"/untagged bucket) may supply more than
// this share of whatever tier threshold is being tested (see
// buildRankInfo in render.js). At 1/3, crossing a tier needs meaningful
// jewels from at least ~3 different areas — hyperfocusing lifetime jewels
// into one or two favorite areas caps out and stalls the badge, which is
// the whole point: this app's ADHD-balance concern (see the Home radar)
// shouldn't be gameable by a rank system that only cares about volume.


// ---- Cadence: repeating ("daily") vs one-time tasks ----
// A one-time task's jewel pays once, on `completedAt`. A "daily" task never
// gets a terminal completion, so it needs its own answer to "did this pay
// out" — derived at read time from sessions, same discipline as everything
// else here (deadline_at's avoidance scoring, impact_tier's weightless-until-
// tagged rule): nothing new is stored, no streak counter, no history of
// misses. Just "is there a session today/in this window," recomputed fresh
// every render.

// True if `task` (a "daily" cadence task) has at least one session that
// *started* within the local calendar day beginning at `dayStart` (a
// midnight-aligned ms timestamp). This is the per-day equivalent of
// `completedAt` being set — the thing that makes today's jewel fire.
export function repeatingTaskOccursOn(task, dayStart) {
  if (task.cadence !== "daily") return false;
  const weekdays = new Set(
    (task.dailyWindows || [])
      .map((window) => Number(window.weekday))
      .filter((weekday) => weekday >= 1 && weekday <= 7),
  );
  if (!weekdays.size) return true;
  const weekday = new Date(dayStart).getDay() || 7;
  return weekdays.has(weekday);
}

export function dailyPayoutOn(task, sessions, dayStart) {
  if (!repeatingTaskOccursOn(task, dayStart)) return false;
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  return sessions.some((s) => s.taskId === task.id && s.start >= dayStart && s.start < dayEnd);
}

// Count of distinct calendar days within [windowStart, windowEnd) on which a
// "daily" cadence task earned its jewel — the cadence equivalent of checking
// `completedAt >= windowStart && completedAt <= windowEnd` for a one-time
// task, just repeated per qualifying day instead of firing once. Returns 0
// (not a fallback to raw time) for a non-"daily" task or one with no
// qualifying day in range.
export function dailyPayoutDayCount(task, sessions, windowStart, windowEnd) {
  if (task.cadence !== "daily") return 0;
  const days = new Set();
  for (const s of sessions) {
    if (s.taskId !== task.id) continue;
    if (s.start < windowStart || s.start >= windowEnd) continue;
    const d = new Date(s.start);
    d.setHours(0, 0, 0, 0);
    if (!repeatingTaskOccursOn(task, d.getTime())) continue;
    days.add(d.getTime());
  }
  return days.size;
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

// Exact-date deadline label for the Home page's "Now" rows (see
// docs/homepage-now-spec.md) — "due Jul 15", with the year appended only when
// it isn't the current one. The now-row's own filling deadline bar carries
// the physical time cue (ADHD rule 3, "make time physical"), so the text can
// be a plain calendar date here. Deliberately flat/factual even once overdue
// — a past date reads as "due Jul 5", never "Overdue!" — per the ADHD x
// gamification rules in CLAUDE.md against urgency/loss framing.
export function deadlineDate(ts, now = Date.now()) {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const opts = sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return `due ${d.toLocaleDateString(undefined, opts)}`;
}

// ms epoch -> "YYYY-MM-DD" for an <input type="date">'s value attribute —
// local calendar date, not a UTC-shifted one (deadlineAt is always stored as
// midnight *local* time, see Task.deadline_at's doc comment).
export function toDateInputValue(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function estPct(task, taskTotal) {
  return task.estimateMin ? Math.min(100, Math.round(taskTotal(task.id) / (task.estimateMin * 60000) * 100)) : 0;
}

// Builds the "capacity bar" — a fixed-width (160px) track carrying
// individual sessions as chips filling it (bringing back the very first
// segmented-bar sketch), the estimate boundary, and the numbers written
// directly ON the bar instead of as separate text beside it. Under the
// estimate, sessions sit at true scale as green chips and the bar just ends
// early; a centered white readout reads "spent │ estimate" (a thin tick
// stands in for the "/"). Once the total crosses the estimate, every chip
// rescales down to keep fitting the same fixed width, whichever session
// straddles the boundary splits into an in-estimate part and an
// over-estimate part, and the readout collapses to just the total plus a
// small "+Xh over" tag.
// Session count used to also live here as a "×N" badge crammed into the
// bar's corner — it's now its own column next to this one (see taskRow in
// render.js), so this only returns `sessionCount` for the caller to render
// there instead of drawing it itself.
export function buildCapacityBar(durations, estimateMin, { trackPx = 160 } = {}) {
  if (!estimateMin) return null;
  const estimateMs = estimateMin * 60000;
  const total = durations.reduce((sum, d) => sum + d, 0);
  const over = total > estimateMs;
  const sessionCount = durations.length;
  const sessionLabel = `${sessionCount} session${sessionCount === 1 ? "" : "s"}`;

  // "in" = within the estimate, "over" = past it. Deliberately not named/
  // colored red/alarm — running past an estimate is exactly the kind of
  // thing ADHD time-blindness makes routine, not a failure worth flagging
  // the way an actual error would be (see docs/adhd-design-principles.md,
  // rule 8: no shame, no permanent record of "against" the user). The bar
  // simply keeps going in a second, calmer tone.
  let segments;
  if (!over) {
    const scale = estimateMs ? trackPx / estimateMs : 0;
    segments = durations.map((d) => ({ cls: "in", widthPx: Math.max(1.5, d * scale) }));
  } else {
    // Compress every session to fit the fixed track: split whichever one
    // straddles the estimate boundary into an in-estimate (before) part and
    // an over-estimate (after) part, then rescale everything by the new,
    // larger total.
    let cum = 0;
    const parts = [];
    for (const d of durations) {
      const segStart = cum;
      const segEnd = cum + d;
      if (segEnd <= estimateMs) parts.push({ d, cls: "in" });
      else if (segStart >= estimateMs) parts.push({ d, cls: "over" });
      else {
        parts.push({ d: estimateMs - segStart, cls: "in" });
        parts.push({ d: segEnd - estimateMs, cls: "over" });
      }
      cum = segEnd;
    }
    const scale = trackPx / total;
    segments = parts.map((p) => ({ cls: p.cls, widthPx: Math.max(1.5, p.d * scale) }));
  }

  const chips = segments.map((segment) => `<i class="seg ${segment.cls}" style="width:${segment.widthPx.toFixed(1)}px"></i>`).join("");

  const title = over
    ? `${sessionLabel} · ${fmtHM(total)} of ${fmtEst(estimateMin)} · ${fmtHM(total - estimateMs)} over`
    : `${sessionLabel} · ${fmtHM(total)} of ${fmtEst(estimateMin)} · ${fmtHM(estimateMs - total)} left`;

  const readout = over
    ? `${fmtHM(total)}<span class="over-tag">+${fmtHM(total - estimateMs)} over</span>`
    : `${fmtHM(total)}<span class="sep"></span><span class="est-part">${fmtEst(estimateMin)}</span>`;

  return {
    over,
    title,
    sessionCount,
    sessionLabel,
    segments,
    totalText: fmtHM(total),
    estimateText: fmtEst(estimateMin),
    overText: fmtHM(total - estimateMs),
    html: `<span class="capbar" title="${title}"><span class="chips">${chips}</span><span class="readout">${readout}</span></span>`,
  };
}
