import React, { useMemo } from "react";
import {
  SESSION_WEEK_CHART_HEIGHT_PX,
  SESSION_WEEK_DAY_COUNT,
  SESSION_WEEK_UNSORTED_KEY,
  SESSIONS_PAGE_COPY,
  UNTAGGED_LIST_COLOR,
} from "../constants";
import { fmtLong, LIFE_AREAS } from "../utils";

function weekDays(weekStart) {
  return Array.from({ length: SESSION_WEEK_DAY_COUNT }, (_, index) => {
    const start = new Date(weekStart);
    start.setDate(start.getDate() + index);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.getTime(), end: end.getTime(), areas: new Map(), total: 0 };
  });
}

export function SessionWeekLifeAreaChart({ weekStart, items, helpers, selectedDayStart, onSelectDay }) {
  const days = useMemo(() => {
    const result = weekDays(weekStart);
    for (const item of items) {
      const task = helpers.findTask(item.taskId);
      const listItem = task ? helpers.list(task.listId) : null;
      const area = LIFE_AREAS.find((candidate) => candidate.key === listItem?.lifeArea);
      const key = area?.key ?? SESSION_WEEK_UNSORTED_KEY;
      for (const interval of item.focusIntervals) {
        result.forEach((day) => {
          const duration = Math.max(0, Math.min(interval.end, day.end) - Math.max(interval.start, day.start));
          if (!duration) return;
          day.areas.set(key, (day.areas.get(key) || 0) + duration);
          day.total += duration;
        });
      }
    }
    return result;
  }, [helpers, items, weekStart]);
  const selectedDay = days.find((day) => day.start === selectedDayStart);
  const maxTotal = Math.max(...days.map((day) => day.total), 1);
  const usedAreaKeys = new Set(days.flatMap((day) => [...day.areas.keys()]));
  const areaOptions = [
    ...LIFE_AREAS,
    {
      key: SESSION_WEEK_UNSORTED_KEY,
      label: SESSIONS_PAGE_COPY.weekChartUnsortedLabel,
      color: UNTAGGED_LIST_COLOR,
    },
  ].filter((area) => usedAreaKeys.has(area.key));

  const areaLabel = (key) => areaOptions.find((area) => area.key === key)?.label;
  const dayLabel = (day) => new Date(day.start).toLocaleDateString(undefined, { weekday: "short" });
  const dateLabel = (day) => new Date(day.start).toLocaleDateString(undefined, { day: "numeric" });
  const detailLabel = (day) => new Date(day.start).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="week-life-chart">
      <div className="week-life-chart-heading">
        <div>
          <strong>{SESSIONS_PAGE_COPY.weekChartHeading}</strong>
          <small>{SESSIONS_PAGE_COPY.weekChartSubheading}</small>
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
        aria-label={SESSIONS_PAGE_COPY.weekChartAriaLabel}
      >
        {days.map((day) => {
          const breakdown = areaOptions
            .filter((area) => day.areas.has(area.key))
            .map((area) => `${area.label}: ${fmtLong(day.areas.get(area.key))}`)
            .join(", ");
          return (
            <div className="week-life-day" key={day.start}>
              <button
                type="button"
                className={selectedDayStart === day.start ? "selected" : ""}
                onClick={() => onSelectDay(selectedDayStart === day.start ? null : day.start)}
                aria-label={`${detailLabel(day)}: ${day.total ? fmtLong(day.total) : SESSIONS_PAGE_COPY.weekChartEmptyDayLabel}${breakdown ? `. ${breakdown}` : ""}`}
                title={breakdown || SESSIONS_PAGE_COPY.weekChartEmptyDayLabel}
              >
                <span className="week-life-stack" style={{ height: `${(day.total / maxTotal) * 100}%` }}>
                  {areaOptions.map((area) => day.areas.has(area.key) ? (
                    <i key={area.key} style={{ background: area.color, flexGrow: day.areas.get(area.key) }} />
                  ) : null)}
                </span>
              </button>
              <span>{dayLabel(day)}<small>{dateLabel(day)}</small></span>
            </div>
          );
        })}
      </div>
      {selectedDay ? (
        <div className="week-life-detail">
          <strong>{detailLabel(selectedDay)} · {selectedDay.total ? fmtLong(selectedDay.total) : SESSIONS_PAGE_COPY.weekChartEmptyDayLabel}</strong>
          {areaOptions.map((area) => selectedDay.areas.has(area.key) ? (
            <span key={area.key}><i style={{ background: area.color }} />{areaLabel(area.key)} {fmtLong(selectedDay.areas.get(area.key))}</span>
          ) : null)}
        </div>
      ) : null}
    </div>
  );
}
