import React from "react";
import { minuteToTime, WEEKDAYS, type GroupedWindow } from "../weekly-schedule";

type WeeklyWindowRowProps = {
  row: GroupedWindow;
  rowIndex: number;
  daysAriaLabel: string;
  hideTime: boolean;
  onWeekdayChange: (rowIndex: number, weekday: number, checked: boolean) => void;
  onTimeChange: (rowIndex: number, field: string, value: string) => void;
  onRemove: (rowIndex: number) => void;
};

export function WeeklyWindowRow({
  row,
  rowIndex,
  daysAriaLabel,
  hideTime,
  onWeekdayChange,
  onTimeChange,
  onRemove,
}: WeeklyWindowRowProps) {
  const overnight = row.startMinute !== null && row.endMinute !== null && row.endMinute < row.startMinute;
  return (
    <div className="simple-availability-row" data-window-row>
      <div className="weekday-pill-row" aria-label={daysAriaLabel}>
        {WEEKDAYS.map((day, index) => {
          const weekday = index + 1;
          const checked = row.weekdays.includes(weekday);
          return (
            <button
              key={day}
              type="button"
              className="weekday-pill"
              aria-pressed={checked}
              onClick={() => onWeekdayChange(rowIndex, weekday, !checked)}
            >
              <span>{day.slice(0, 3)}</span>
            </button>
          );
        })}
      </div>
      <div className="availability-time-row" hidden={hideTime}>
        <input
          type="time"
          aria-label="Available from"
          value={minuteToTime(row.startMinute)}
          onInput={(event) => onTimeChange(rowIndex, "startMinute", event.currentTarget.value)}
          onChange={(event) => onTimeChange(rowIndex, "startMinute", event.currentTarget.value)}
        />
        <span>to</span>
        <div className="availability-end-field">
          <input
            type="time"
            aria-label="Available until"
            value={minuteToTime(row.endMinute)}
            onInput={(event) => onTimeChange(rowIndex, "endMinute", event.currentTarget.value)}
            onChange={(event) => onTimeChange(rowIndex, "endMinute", event.currentTarget.value)}
          />
          <span className="overnight-indicator" hidden={!overnight}>Next day</span>
        </div>
        <button type="button" className="weekly-window-remove" onClick={() => onRemove(rowIndex)} aria-label="Remove time window">×</button>
      </div>
    </div>
  );
}
