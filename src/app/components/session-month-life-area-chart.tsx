import React, { useMemo } from "react";
import {
  SESSION_WEEK_CHART_HEIGHT_PX,
  SESSION_WEEK_UNSORTED_KEY,
  SESSIONS_PAGE_COPY,
  UNTAGGED_LIST_COLOR,
} from "../constants";
import { fmtLong, LIFE_AREAS } from "../utils";

export function monthWeeks(monthStartMs) {
  const result = [];
  const start = new Date(monthStartMs);
  let current = new Date(start);
  
  // Go to the first day of the month
  current.setDate(1);
  current.setHours(0, 0, 0, 0);
  
  // Find the Monday of the first week
  const diffFromMonday = (current.getDay() + 6) % 7;
  const calendarWeekStart = new Date(current);
  calendarWeekStart.setDate(calendarWeekStart.getDate() - diffFromMonday);
  
  // The month ends on the last day of the month
  const endOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
  
  let iter = new Date(calendarWeekStart);
  
  while (iter.getTime() <= endOfMonth.getTime()) {
    const weekStart = iter.getTime();
    const nextWeek = new Date(iter);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    // Intersect with month
    const actualStart = Math.max(weekStart, start.getTime());
    const actualEnd = Math.min(nextWeek.getTime(), endOfMonth.getTime() + 1);
    
    if (actualStart < actualEnd) {
      result.push({ start: actualStart, end: actualEnd, areas: new Map(), total: 0 });
    }
    iter = nextWeek;
  }
  return result;
}

export function SessionMonthLifeAreaChart({ monthStart, items, helpers, selectedWeek, onSelectWeek }) {
  const weeks = useMemo(() => {
    const result = monthWeeks(monthStart);
    for (const item of items) {
      const task = helpers.findTask(item.taskId);
      const listItem = task ? helpers.list(task.listId) : null;
      const area = LIFE_AREAS.find((candidate) => candidate.key === listItem?.lifeArea);
      const key = area?.key ?? SESSION_WEEK_UNSORTED_KEY;
      for (const interval of item.focusIntervals) {
        result.forEach((week) => {
          const duration = Math.max(0, Math.min(interval.end, week.end) - Math.max(interval.start, week.start));
          if (!duration) return;
          week.areas.set(key, (week.areas.get(key) || 0) + duration);
          week.total += duration;
        });
      }
    }
    return result;
  }, [helpers, items, monthStart]);
  
  const selectedW = selectedWeek ? weeks.find((w) => w.start === selectedWeek.start) : null;
  const maxTotal = Math.max(...weeks.map((w) => w.total), 1);
  const usedAreaKeys = new Set(weeks.flatMap((w) => [...w.areas.keys()]));
  const areaOptions = [
    ...LIFE_AREAS,
    {
      key: SESSION_WEEK_UNSORTED_KEY,
      label: SESSIONS_PAGE_COPY.weekChartUnsortedLabel,
      color: UNTAGGED_LIST_COLOR,
    },
  ].filter((area) => usedAreaKeys.has(area.key));

  const areaLabel = (key) => areaOptions.find((area) => area.key === key)?.label;
  
  const weekLabelShort = (w) => {
    const d1 = new Date(w.start);
    const d2 = new Date(w.end - 1);
    if (d1.getDate() === d2.getDate()) return `${d1.getDate()}`;
    return `${d1.getDate()} - ${d2.getDate()}`;
  };

  const weekLabelDetail = (w) => {
    const d1 = new Date(w.start);
    const d2 = new Date(w.end - 1);
    const opts = { month: "short", day: "numeric" };
    if (d1.getTime() === new Date(d2.getFullYear(), d2.getMonth(), d2.getDate(), d1.getHours(), d1.getMinutes(), d1.getSeconds(), d1.getMilliseconds()).getTime()) {
      return d1.toLocaleDateString(undefined, opts);
    }
    return `${d1.toLocaleDateString(undefined, opts)} - ${d2.toLocaleDateString(undefined, opts)}`;
  };

  return (
    <div className="week-life-chart">
      <div className="week-life-chart-heading">
        <div>
          <strong>{SESSIONS_PAGE_COPY.monthChartHeading || "Month Breakdown"}</strong>
          <small>{SESSIONS_PAGE_COPY.monthChartSubheading || "Focus time by week and life area"}</small>
        </div>
      </div>
      <div className="week-life-legend">
        {areaOptions.map((area) => (
          <span key={area.key}><i style={{ background: area.color }} />{area.label}</span>
        ))}
      </div>
      <div
        className="week-life-bars"
        style={{ height: `${SESSION_WEEK_CHART_HEIGHT_PX}px` }}
        role="group"
        aria-label={SESSIONS_PAGE_COPY.monthChartAriaLabel || "Month chart"}
      >
        {weeks.map((w) => {
          const breakdown = areaOptions
            .filter((area) => w.areas.has(area.key))
            .map((area) => `${area.label}: ${fmtLong(w.areas.get(area.key))}`)
            .join(", ");
          const isSelected = selectedW && selectedW.start === w.start;
          return (
            <div className="week-life-day" key={w.start}>
              <button
                type="button"
                className={isSelected ? "selected" : ""}
                onClick={() => onSelectWeek(isSelected ? null : w)}
                aria-label={`${weekLabelDetail(w)}: ${w.total ? fmtLong(w.total) : "No focus time"}${breakdown ? `. ${breakdown}` : ""}`}
                title={breakdown || "No focus time"}
              >
                <span className="week-life-stack" style={{ height: `${(w.total / maxTotal) * 100}%` }}>
                  {areaOptions.map((area) => w.areas.has(area.key) ? (
                    <i key={area.key} style={{ background: area.color, flexGrow: w.areas.get(area.key) }} />
                  ) : null)}
                </span>
              </button>
              <span>Week<small>{weekLabelShort(w)}</small></span>
            </div>
          );
        })}
      </div>
      {selectedW ? (
        <div className="week-life-detail">
          <strong>{weekLabelDetail(selectedW)} · {selectedW.total ? fmtLong(selectedW.total) : "No focus time"}</strong>
          {areaOptions.map((area) => selectedW.areas.has(area.key) ? (
            <span key={area.key}><i style={{ background: area.color }} />{areaLabel(area.key)} {fmtLong(selectedW.areas.get(area.key))}</span>
          ) : null)}
        </div>
      ) : null}
    </div>
  );
}
