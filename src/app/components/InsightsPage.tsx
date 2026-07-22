import React, { useState } from "react";
import _ from "lodash";
import { fmt, fmtLong, fmtHM, LIFE_AREAS } from "../utils.jsx";
import { StickyHeader } from "./sticky-header.jsx";
import { useApp } from "../context/AppContext.jsx";
import { INSIGHTS_HERO_ICON_SIZE, INSIGHTS_ICON_SIZE, LOGICAL_SESSION_STATUS, PLANNER_MILLISECONDS_PER_DAY, SESSION_COPY, SESSION_INTERVAL_KIND, SESSION_PLAYBACK_COPY, TRACK_PX, UNTAGGED_LIST_COLOR } from "../constants.jsx";
import { BarChart2 } from "lucide-react";
import { useSessionNow } from "../hooks/use-session-now";

export function InsightsPage() {
  const { state, helpers, actions } = useApp();
  const [expandedSessionGroups, setExpandedSessionGroups] = useState(new Set());
  const [insightsPeriod, setInsightsPeriod] = useState("day"); // 'day', 'week', 'month'
  const now = useSessionNow(state.S?.run?.activeSessionId, 60000);

  if (!state.S) return null;

  const toggleSessionGroup = (scopeKey, taskId) => {
    const key = `${scopeKey}:${taskId}`;
    const next = new Set(expandedSessionGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedSessionGroups(next);
  };

  const dayLabel = (ts) => {
    const date = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today.getTime() - PLANNER_MILLISECONDS_PER_DAY);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };

  const weekStartOf = (ts) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    const diffFromMonday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diffFromMonday);
    return d.getTime();
  };

  const items = helpers.logicalSessions(now);

  const renderRowActions = (item) => {
    if (item.status !== LOGICAL_SESSION_STATUS.finished) {
      return <span className="entry-del" />;
    }
    const storedFocus = item.focusIntervals.filter((interval) => interval.id);
    return (
      <>
        {storedFocus.length === 1 ? (
          <button className="entry-edit" title={SESSION_COPY.editFocusIntervalTitle} onClick={() => actions.editSession(storedFocus[0].id)}>✎</button>
        ) : <span className="entry-edit" />}
        <button
          className="entry-del"
          title={SESSION_COPY.removeLogicalTitle}
          onClick={() => item.legacy ? actions.deleteSession(item.id) : actions.deleteLogicalSession(item.id)}
        >×</button>
      </>
    );
  };

  const buildTrackAndRuler = (periodItems, periodStart, periodMs, majorMs, minorMs, labels, nowInRange) => {
    const timelineItems = periodItems.flatMap((item) => [
      ...item.focusIntervals.map((interval) => ({ ...interval, taskId: item.taskId })),
      ...item.breakIntervals.map((interval) => ({ ...interval, taskId: item.taskId })),
    ]);
    const segs = timelineItems.map((item, idx) => {
      const task = helpers.findTask(item.taskId);
      const listItem = task ? helpers.list(task.listId) : null;
      const startFrac = Math.max(0, (item.start - periodStart) / periodMs);
      const endFrac = Math.min(1, (item.end - periodStart) / periodMs);
      const left = startFrac * TRACK_PX;
      const width = Math.max(2, (endFrac - startFrac) * TRACK_PX);
      const label = task ? task.name : SESSION_PLAYBACK_COPY.deletedTaskLabel;
      const range = `${new Date(item.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–${new Date(item.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      const breakInterval = item.kind === SESSION_INTERVAL_KIND.break;
      const title = `${label} · ${breakInterval ? SESSION_PLAYBACK_COPY.breakLabel : SESSION_PLAYBACK_COPY.focusLabel} · ${range} · ${fmt(item.end - item.start)}`;
      return (
        <i
          key={idx}
          className={`seg${item.live ? " live" : ""}${breakInterval ? " break" : ""}`}
          style={{ left: `${left.toFixed(1)}px`, width: `${width.toFixed(1)}px`, background: breakInterval ? "var(--blue)" : listItem ? listItem.color : UNTAGGED_LIST_COLOR }}
          title={title}
        />
      );
    });

    const nowNeedle = nowInRange ? (
      <span className="now-line" style={{ left: `${(((now - periodStart) / periodMs) * TRACK_PX).toFixed(1)}px` }} />
    ) : null;

    const ticks = [];
    for (let ms = minorMs; ms < periodMs; ms += minorMs) {
      const isMajor = ms % majorMs === 0;
      ticks.push(
        <i
          key={ms}
          className={`rtick${isMajor ? " major" : ""}`}
          style={{ left: `${((ms / periodMs) * TRACK_PX).toFixed(1)}px` }}
        />
      );
    }

    return (
      <>
        <div className="daybar" style={{ width: `${TRACK_PX}px` }}>{segs}{nowNeedle}</div>
        <div className="dayruler" style={{ width: `${TRACK_PX}px` }}>{ticks}</div>
        <div className="ticks" style={{ width: `${TRACK_PX}px` }}>
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      </>
    );
  };

  const buildDayLanes = (dayItems, dayStart, nowInRange) => {
    const periodMs = PLANNER_MILLISECONDS_PER_DAY;
    const laneMap = new Map();
    for (const item of dayItems) {
      const task = helpers.findTask(item.taskId);
      const listItem = task ? helpers.list(task.listId) : null;
      const area = listItem && listItem.lifeArea ? LIFE_AREAS.find((a) => a.key === listItem.lifeArea) : null;
      const key = area ? area.key : "other";
      if (!laneMap.has(key)) {
        laneMap.set(key, { label: area ? area.label : "Other", color: area ? area.color : UNTAGGED_LIST_COLOR, items: [] });
      }
      laneMap.get(key).items.push(item);
    }
    const orderedKeys = [...LIFE_AREAS.map((a) => a.key), "other"].filter((k) => laneMap.has(k));
    const LANE_H = 30, NOTE_H = 20, LABEL_W = 92, LANE_GAP = 8;
    const LANE_TRACK_PX = TRACK_PX - LABEL_W - LANE_GAP;

    const gridLines = [];
    for (let h = 0; h <= 24; h++) {
      gridLines.push(
        <i
          key={h}
          className="grid-line"
          style={{ left: `${((h / 24) * LANE_TRACK_PX).toFixed(1)}px` }}
        />
      );
    }

    const notes = [];
    orderedKeys.forEach((key, i) => {
      const lane = laneMap.get(key);
      const top = i * LANE_H + (LANE_H - NOTE_H) / 2;
      lane.items.forEach((item, idx) => {
        const task = helpers.findTask(item.taskId);
        const intervals = [...item.focusIntervals, ...item.breakIntervals];
        intervals.forEach((interval, intervalIndex) => {
          const startFrac = Math.max(0, (interval.start - dayStart) / periodMs);
          const endFrac = Math.min(1, (interval.end - dayStart) / periodMs);
          const left = startFrac * LANE_TRACK_PX;
          const width = Math.max(3, (endFrac - startFrac) * LANE_TRACK_PX);
          const label = task ? task.name : SESSION_PLAYBACK_COPY.deletedTaskLabel;
          const range = `${new Date(interval.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–${new Date(interval.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
          const breakInterval = interval.kind === SESSION_INTERVAL_KIND.break;
          const title = `${label} · ${breakInterval ? SESSION_PLAYBACK_COPY.breakLabel : SESSION_PLAYBACK_COPY.focusLabel} · ${range} · ${fmt(interval.end - interval.start)}`;
          notes.push(
            <i
              key={`${key}-${idx}-${intervalIndex}`}
              className={`lane-note${interval.live ? " live" : ""}${breakInterval ? " break" : ""}`}
              style={{ left: `${left.toFixed(1)}px`, width: `${width.toFixed(1)}px`, top: `${top}px`, height: `${NOTE_H}px`, background: breakInterval ? "var(--blue)" : lane.color }}
              title={title}
            />
          );
        });
      });
    });

    const totalH = orderedKeys.length * LANE_H;
    const nowNeedle = nowInRange ? (
      <span className="now-line" style={{ left: `${(((now - dayStart) / periodMs) * LANE_TRACK_PX).toFixed(1)}px`, top: 0, bottom: 0 }} />
    ) : null;

    const labelsHtml = orderedKeys.map((key) => (
      <div key={key} className="lane-label" style={{ height: `${LANE_H}px` }}>
        {laneMap.get(key).label}
      </div>
    ));
    const ticksLabels = ["12a", "6a", "12p", "6p", "12a"];

    return (
      <>
        <div className="lanes-wrap">
          <div className="lanes-labels" style={{ width: `${LABEL_W}px` }}>{labelsHtml}</div>
          <div className="lanes-track" style={{ width: `${LANE_TRACK_PX}px`, height: `${totalH}px` }}>
            {gridLines}
            {notes}
            {nowNeedle}
          </div>
        </div>
        <div className="lanes-ticks-row">
          <div className="lanes-labels-spacer" style={{ width: `${LABEL_W}px` }} />
          <div className="ticks" style={{ width: `${LANE_TRACK_PX}px` }}>
            {ticksLabels.map((l, i) => <span key={i}>{l}</span>)}
          </div>
        </div>
      </>
    );
  };

  const buildMonthRuler = (monthItems, monthStart, daysInMonth) => {
    const dayTotals = new Map();
    for (const item of monthItems) {
      const dayIdx = Math.floor((item.start - monthStart) / PLANNER_MILLISECONDS_PER_DAY);
      if (dayIdx < 0 || dayIdx >= daysInMonth) continue;
      const dur = item.focusMs;
      const entry = dayTotals.get(dayIdx) || { total: 0, byList: new Map() };
      entry.total += dur;
      const task = helpers.findTask(item.taskId);
      const listId = task ? task.listId : "none";
      entry.byList.set(listId, (entry.byList.get(listId) || 0) + dur);
      dayTotals.set(dayIdx, entry);
    }
    const maxTotal = Math.max(1, ...Array.from(dayTotals.values()).map((e) => e.total));
    const dayWidth = TRACK_PX / daysInMonth;

    const bars = [];
    for (let d = 0; d < daysInMonth; d++) {
      const entry = dayTotals.get(d);
      const left = d * dayWidth + dayWidth * 0.15;
      const width = Math.max(3, dayWidth * 0.7);
      const dateLabel = new Date(monthStart + d * PLANNER_MILLISECONDS_PER_DAY).toLocaleDateString([], { month: "short", day: "numeric" });
      if (!entry || entry.total <= 0) {
        bars.push(
          <span
            key={d}
            className="mday"
            style={{ left: `${left.toFixed(1)}px`, width: `${width.toFixed(1)}px`, height: "2px", background: "#3a3a3a" }}
            title={`${dateLabel} · no tracked time`}
          />
        );
        continue;
      }
      let bestList = null, bestMs = -1;
      for (const [listId, ms] of entry.byList) {
        if (ms > bestMs) {
          bestMs = ms;
          bestList = listId;
        }
      }
      const listItem = bestList && bestList !== "none" ? helpers.list(bestList) : null;
      const height = Math.max(3, Math.round((entry.total / maxTotal) * 22));
      bars.push(
        <span
          key={d}
          className="mday"
          style={{ left: `${left.toFixed(1)}px`, width: `${width.toFixed(1)}px`, height: `${height}px`, background: listItem ? listItem.color : "#888" }}
          title={`${dateLabel} · ${fmtLong(entry.total)}`}
        />
      );
    }

    const firstDow = new Date(monthStart).getDay();
    const offsetToMonday = (8 - firstDow) % 7;
    const majors = [];
    const labels = [];
    if (offsetToMonday !== 0) {
      majors.push(<span key="start" className="mweek" style={{ left: "0px" }} />);
      labels.push(new Date(monthStart).toLocaleDateString([], { month: "short", day: "numeric" }));
    }
    for (let d = offsetToMonday; d < daysInMonth; d += 7) {
      majors.push(<span key={d} className="mweek" style={{ left: `${((d / daysInMonth) * TRACK_PX).toFixed(1)}px` }} />);
      labels.push(new Date(monthStart + d * PLANNER_MILLISECONDS_PER_DAY).toLocaleDateString([], { month: "short", day: "numeric" }));
    }

    const periodMs = daysInMonth * PLANNER_MILLISECONDS_PER_DAY;
    const monthNowInRange = now >= monthStart && now < monthStart + periodMs;
    const nowNeedle = monthNowInRange ? (
      <span className="now-line" style={{ left: `${(((now - monthStart) / periodMs) * TRACK_PX).toFixed(1)}px`, top: "-4px", bottom: "-2px" }} />
    ) : null;

    return (
      <>
        <div className="monthruler" style={{ width: `${TRACK_PX}px` }}>
          {majors}
          {bars}
          {nowNeedle}
        </div>
        <div className="ticks" style={{ width: `${TRACK_PX}px` }}>
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      </>
    );
  };

  const buildTaskRollup = (scopeKey, scopeItems, granularity) => {
    const grouped = _.groupBy(scopeItems, (item) => item.taskId ?? "");
    const taskGroups = _.orderBy(
      _.values(grouped),
      [
        (group) => _.sumBy(group, (item) => item.focusMs)
      ],
      ["desc"]
    );

    return taskGroups.map((groupItems, groupIdx) => {
      const taskId = groupItems[0].taskId;
      const task = helpers.findTask(taskId);
      const listItem = task ? helpers.list(task.listId) : null;
      const groupTotal = _.sumBy(groupItems, (item) => item.focusMs);
      const anyLive = groupItems.some((item) => item.status === LOGICAL_SESSION_STATUS.focus);
      const name = `${task ? task.name : SESSION_PLAYBACK_COPY.deletedTaskLabel}${anyLive ? ` · ${SESSION_COPY.recordingLabel}` : ""}`;
      const groupKey = `${scopeKey}:${taskId}`;
      const expanded = expandedSessionGroups.has(groupKey);

      let badge, subRows;
      if (granularity === "session") {
        badge = `${groupItems.length} session${groupItems.length === 1 ? "" : "s"}`;
        subRows = expanded
          ? groupItems.map((item, idx) => {
              const range = `${new Date(item.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–${item.end ? new Date(item.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "now"}`;
              return (
                <div key={idx} className="sub-sess">
                  <span className="sub-range">{range}</span>
                  <span className="sub-dur">{SESSION_PLAYBACK_COPY.breakdownLabel(fmt(item.focusMs), fmt(item.breakMs))}</span>
                  {renderRowActions(item)}
                </div>
              );
            })
          : null;
      } else {
        const dayGroups = _.groupBy(groupItems, (item) => {
          const d = new Date(item.start);
          return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        });
        const days = _.orderBy(
          _.map(dayGroups, (items) => ({
            ts: items[0].start,
            total: _.sumBy(items, (item) => item.focusMs)
          })),
          ["ts"],
          ["desc"]
        );
        badge = `${days.length} day${days.length === 1 ? "" : "s"}`;
        subRows = expanded
          ? days.map((d, idx) => (
              <div key={idx} className="sub-sess">
                <span className="sub-range">{dayLabel(d.ts)}</span>
                <span className="sub-dur">{fmtLong(d.total)}</span>
              </div>
            ))
          : null;
      }

      const listLink = (text) =>
        listItem ? (
          <span
            className="list-link"
            onClick={() => {
              actions.selectList(listItem.id);
              actions.navigate({ view: "tasks" });
            }}
            title={`Go to ${listItem.name}`}
            style={{ cursor: "pointer" }}
          >
            {text}
          </span>
        ) : (
          text
        );

      return (
        <React.Fragment key={groupIdx}>
          <div
            className={`sess task-row ${anyLive ? "live" : ""}`}
            onClick={() => toggleSessionGroup(scopeKey, taskId)}
            style={{ cursor: "pointer" }}
          >
            <span className="chev">{expanded ? "▾" : "▸"}</span>
            <span className="sess-dot" style={{ background: listItem ? listItem.color : "#555" }} />
            <span className="sess-name" onClick={(e) => e.stopPropagation()}>{listLink(name)}</span>
            <span className="sess-list" onClick={(e) => e.stopPropagation()}>{listItem ? listLink(listItem.name) : ""}</span>
            <span className="task-badge">{badge}</span>
            <span className="sess-dur">{fmtLong(groupTotal)}</span>
          </div>
          {subRows}
        </React.Fragment>
      );
    });
  };

  const renderPeriodContent = () => {
    if (!items.length) {
      return <div className="empty">No sessions yet. Press play on a task to start tracking.</div>;
    }

    if (insightsPeriod === "week") {
      const weekMs = 7 * PLANNER_MILLISECONDS_PER_DAY;
      const weeks = new Map();
      for (const item of items) {
        const ws = weekStartOf(item.start);
        if (!weeks.has(ws)) weeks.set(ws, []);
        weeks.get(ws).push(item);
      }
      const nowWeekStart = weekStartOf(now);
      const weekKeys = Array.from(weeks.keys()).sort((a, b) => b - a);

      return weekKeys.map((ws) => {
        const weekItems = weeks.get(ws);
        const total = weekItems.reduce((sum, item) => sum + item.focusMs, 0);
        const label = ws === nowWeekStart ? "This week" : ws === nowWeekStart - weekMs ? "Last week" : `Week of ${new Date(ws).toLocaleDateString([], { month: "short", day: "numeric" })}`;
        return (
          <section key={ws} className="sess-group">
            <div className="sess-head">
              <h4>{label}</h4>
              <span className="sess-total">{fmtLong(total)}</span>
            </div>
            {buildTrackAndRuler(weekItems, ws, weekMs, PLANNER_MILLISECONDS_PER_DAY, PLANNER_MILLISECONDS_PER_DAY / 4, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"], ws === nowWeekStart)}
            {buildTaskRollup(`w${ws}`, weekItems, "day")}
          </section>
        );
      });
    }

    if (insightsPeriod === "month") {
      const months = new Map();
      for (const item of items) {
        const d = new Date(item.start);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!months.has(key)) months.set(key, []);
        months.get(key).push(item);
      }
      const nowD = new Date(now);
      const nowKey = `${nowD.getFullYear()}-${nowD.getMonth()}`;
      const lastD = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
      const lastKey = `${lastD.getFullYear()}-${lastD.getMonth()}`;
      const monthKeys = Array.from(months.keys()).sort((a, b) => {
        const [ay, am] = a.split("-").map(Number);
        const [by, bm] = b.split("-").map(Number);
        return (by * 12 + bm) - (ay * 12 + am);
      });

      return monthKeys.map((key) => {
        const [y, m] = key.split("-").map(Number);
        const monthStart = new Date(y, m, 1).getTime();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const monthItems = months.get(key);
        const total = monthItems.reduce((sum, item) => sum + item.focusMs, 0);
        const label = key === nowKey ? "This month" : key === lastKey ? "Last month" : new Date(y, m, 1).toLocaleDateString([], { month: "long", year: "numeric" });
        return (
          <section key={key} className="sess-group">
            <div className="sess-head">
              <h4>{label}</h4>
              <span className="sess-total">{fmtLong(total)}</span>
            </div>
            {buildMonthRuler(monthItems, monthStart, daysInMonth)}
            {buildTaskRollup(`m${key}`, monthItems, "day")}
          </section>
        );
      });
    }

    // Default: 'day'
    const dayKey = (ts) => {
      const date = new Date(ts);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    };
    const groups = [];
    let currentGroup = null;
    for (const item of items) {
      const key = dayKey(item.start);
      if (!currentGroup || currentGroup.key !== key) {
        currentGroup = { key, ts: item.start, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(item);
    }
    const todayKey = dayKey(now);

    return groups.map((group) => {
      const total = group.items.reduce((sum, item) => sum + item.focusMs, 0);
      const dayStart = new Date(group.ts);
      dayStart.setHours(0, 0, 0, 0);
      return (
        <section key={group.key} className="sess-group">
          <div className="sess-head">
            <h4>{dayLabel(group.ts)}</h4>
            <span className="sess-total">{fmtLong(total)}</span>
          </div>
          {buildDayLanes(group.items, dayStart.getTime(), group.key === todayKey)}
          {buildTaskRollup(group.key, group.items, "session")}
        </section>
      );
    });
  };

  const todayMs = helpers.todayTotalMs();
  const allMs = state.S.lists.reduce((sum, listItem) => sum + helpers.listTotal(listItem.id), 0);
  const doneCount = state.S.tasks.filter((task) => task.completedAt).length;
  const todayJewelCount = helpers.todayJewels();
  const allTimeJewelCount = helpers.lifetimeJewelsNet();

  return (
    <>
      <StickyHeader icon={<BarChart2 size={INSIGHTS_ICON_SIZE} />} name="Insights" />
      <div className="hdr" data-tauri-drag-region>
        <div className="cover" style={{ background: "linear-gradient(135deg,#2e7d4f,#0c3f26)" }}><BarChart2 size={INSIGHTS_HERO_ICON_SIZE} aria-hidden="true" /></div>
        <div className="info">
          <small>History</small>
          <h1>Insights</h1>
          <div className="sub">{items.length} session{items.length === 1 ? "" : "s"} across all tasks</div>
        </div>
      </div>
      <div className="insights-summary">
        <div className="hs-stat"><div className="hs-num">{fmtHM(todayMs)}</div><div className="hs-label">Today</div></div>
        <div className="hs-stat"><div className="hs-num">{fmtHM(allMs)}</div><div className="hs-label">All time</div></div>
        <div className="hs-stat"><div className="hs-num">{doneCount}</div><div className="hs-label">Completed</div></div>
        <div className="hs-stat"><div className="hs-num">{state.S.lists.length}</div><div className="hs-label">Lists</div></div>
        <div className="hs-stat"><div className="hs-num">{todayJewelCount > 0 ? "+" : ""}{todayJewelCount}</div><div className="hs-label">Jewels today</div></div>
        <div className="hs-stat"><div className="hs-num">{allTimeJewelCount > 0 ? "+" : ""}{allTimeJewelCount}</div><div className="hs-label">Jewels all-time</div></div>
      </div>
      <div className="insights-page">
        <div className="period-tabs">
          <button className={insightsPeriod === "day" ? "active" : ""} onClick={() => setInsightsPeriod("day")}>Day</button>
          <button className={insightsPeriod === "week" ? "active" : ""} onClick={() => setInsightsPeriod("week")}>Week</button>
          <button className={insightsPeriod === "month" ? "active" : ""} onClick={() => setInsightsPeriod("month")}>Month</button>
        </div>
        {renderPeriodContent()}
      </div>
    </>
  );
}

// Backward-compatible export
export const insightsPage = (props) => <InsightsPage {...props} />;
