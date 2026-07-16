import React, { useEffect, useRef, useState } from "react";
import {
  groupWeeklyWindows,
  minuteToTime,
  timeToMinute,
  WEEKDAYS,
  weeklyWindowsSignature,
} from "../weekly-schedule.jsx";

export function WeeklyAvailabilityEditor({
  id,
  initialWindows = [],
  onSave,
  requireWeekday = false,
  daysAriaLabel = "Available days",
  emptyMeansEveryDay = false,
  everyDayLabel = "Every day",
}) {
  const [rows, setRows] = useState(() => groupWeeklyWindows(initialWindows));
  const pendingSignatures = useRef(new Set());
  const initialSignature = weeklyWindowsSignature(initialWindows);

  useEffect(() => {
    if (pendingSignatures.current.delete(initialSignature)) return;
    setRows(groupWeeklyWindows(initialWindows));
  }, [initialSignature]);

  const triggerSave = (nextRows) => {
    if (!onSave) return;
    const windows = [];
    nextRows.forEach((row) => {
      row.weekdays.forEach((dayNum) => {
        windows.push({
          weekday: dayNum,
          startMinute: row.startMinute,
          endMinute: row.endMinute,
        });
      });
    });
    const signature = weeklyWindowsSignature(windows);
    if (pendingSignatures.current.has(signature)) return;
    pendingSignatures.current.add(signature);
    onSave(windows);
  };

  const handleWeekdayChange = (rowIdx, weekday, checked) => {
    const selectedCount = rows.reduce((sum, row) => sum + row.weekdays.length, 0);
    if (requireWeekday && !checked && selectedCount === 1) return;
    const nextRows = rows.map((row, rIdx) => {
      if (rIdx !== rowIdx) return row;
      const weekdays = checked
        ? [...new Set([...row.weekdays, weekday])]
        : row.weekdays.filter((w) => w !== weekday);
      return { ...row, weekdays };
    });
    setRows(nextRows);
    triggerSave(nextRows);
  };

  const handleTimeChange = (rowIdx, field, value) => {
    const nextRows = rows.map((row, rIdx) => {
      if (rIdx !== rowIdx) return row;
      const minutes = timeToMinute(value);
      return { ...row, [field]: minutes };
    });
    setRows(nextRows);
    triggerSave(nextRows);
  };

  const selectEveryDay = () => {
    const firstRow = rows[0] || { startMinute: 9 * 60, endMinute: 17 * 60 };
    const nextRows = [{ ...firstRow, weekdays: [] }];
    setRows(nextRows);
    triggerSave(nextRows);
  };

  const addRow = () => {
    const nextRows = [...rows, { weekdays: [], startMinute: 9 * 60, endMinute: 17 * 60 }];
    setRows(nextRows);
    triggerSave(nextRows);
  };

  const removeRow = (rowIdx) => {
    if (rows.length === 1) return;
    const nextRows = rows.filter((_, rIdx) => rIdx !== rowIdx);
    setRows(nextRows);
    triggerSave(nextRows);
  };

  return (
    <div className="weekly-editor simple-availability" id={id} data-day-mode="simple">
      {emptyMeansEveryDay ? (
        <button
          type="button"
          className="repeat-every-day"
          aria-pressed={rows.every((row) => !row.weekdays.length)}
          onClick={selectEveryDay}
        >
          {everyDayLabel}
        </button>
      ) : null}
      <div className="simple-availability-list" data-window-list>
        {rows.map((row, rowIdx) => {
          const isOvernight = row.startMinute !== null && row.endMinute !== null && row.endMinute < row.startMinute;
          return (
            <div key={rowIdx} className="simple-availability-row" data-window-row>
              <div className="weekday-pill-row" aria-label={daysAriaLabel}>
                {WEEKDAYS.map((day, index) => {
                  const weekdayNum = index + 1;
                  const checked = row.weekdays.includes(weekdayNum);
                  return (
                    <button
                      key={day}
                      type="button"
                      className="weekday-pill"
                      aria-pressed={checked}
                      onClick={() => handleWeekdayChange(rowIdx, weekdayNum, !checked)}
                    >
                      <span>{day.slice(0, 3)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="availability-time-row" hidden={emptyMeansEveryDay && !row.weekdays.length}>
                <input
                  type="time"
                  aria-label="Available from"
                  value={minuteToTime(row.startMinute)}
                  onInput={(e) => handleTimeChange(rowIdx, "startMinute", e.currentTarget.value)}
                  onChange={(e) => handleTimeChange(rowIdx, "startMinute", e.currentTarget.value)}
                />
                <span>to</span>
                <div className="availability-end-field">
                  <input
                    type="time"
                    aria-label="Available until"
                    value={minuteToTime(row.endMinute)}
                    onInput={(e) => handleTimeChange(rowIdx, "endMinute", e.currentTarget.value)}
                    onChange={(e) => handleTimeChange(rowIdx, "endMinute", e.currentTarget.value)}
                  />
                  <span className="overnight-indicator" hidden={!isOvernight}>Next day</span>
                </div>
                <button
                  type="button"
                  className="weekly-window-remove"
                  onClick={() => removeRow(rowIdx)}
                  aria-label="Remove time window"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="linkbtn blue weekly-window-add"
        onClick={addRow}
        hidden={emptyMeansEveryDay && rows.every((row) => !row.weekdays.length)}
      >
        ＋ Add another time
      </button>
    </div>
  );
}
