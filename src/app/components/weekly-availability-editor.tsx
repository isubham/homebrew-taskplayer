import React, { useEffect, useRef, useState } from "react";
import {
  groupWeeklyWindows,
  timeToMinute,
  weeklyWindowsSignature,
} from "../weekly-schedule.jsx";
import type { ScheduleIssue } from "../schedule-validation";
import { WeeklyWindowRow } from "./weekly-window-row";

export function WeeklyAvailabilityEditor({
  id,
  initialWindows = [],
  onSave,
  requireWeekday = false,
  daysAriaLabel = "Available days",
  inspectWindows,
  onBlockingChange,
}) {
  const [rows, setRows] = useState(() => groupWeeklyWindows(initialWindows));
  const [issues, setIssues] = useState<ScheduleIssue[]>(() => inspectWindows?.(initialWindows) || []);
  const pendingSignatures = useRef(new Set());
  const initialSignature = weeklyWindowsSignature(initialWindows);

  useEffect(() => {
    if (pendingSignatures.current.delete(initialSignature)) return;
    setRows(groupWeeklyWindows(initialWindows));
    setIssues(inspectWindows?.(initialWindows) || []);
  }, [initialSignature]);

  useEffect(() => {
    onBlockingChange?.(issues.some((issue) => issue.blocking));
  }, [issues, onBlockingChange]);

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
    const nextIssues = inspectWindows?.(windows) || [];
    setIssues(nextIssues);
    if (nextIssues.some((issue) => issue.blocking)) return;
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
      <div className="simple-availability-list" data-window-list>
        {rows.map((row, rowIdx) => (
          <WeeklyWindowRow
            key={rowIdx}
            row={row}
            rowIndex={rowIdx}
            daysAriaLabel={daysAriaLabel}
            hideTime={false}
            onWeekdayChange={handleWeekdayChange}
            onTimeChange={handleTimeChange}
            onRemove={removeRow}
          />
        ))}
      </div>
      {issues.length ? (
        <div className="schedule-issues" aria-live="polite">
          {issues.map((issue, index) => (
            <div key={`${issue.message}:${index}`} className={`schedule-issue${issue.blocking ? " blocking" : ""}`}>
              {issue.message}
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="linkbtn blue weekly-window-add"
        onClick={addRow}
      >
        ＋ Add another time
      </button>
    </div>
  );
}
