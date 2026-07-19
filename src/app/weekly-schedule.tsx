import _ from "lodash";
import { WeeklyTimeWindow } from "./bindings";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const minuteToTime = (minutes: number | null | undefined): string => {
  const value = Number.isFinite(Number(minutes)) ? Number(minutes) : 9 * 60;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};

export const timeToMinute = (value: string | null | undefined): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

export const isOvernightWindow = (startMinute: number | null, endMinute: number | null): boolean =>
  startMinute !== null && endMinute !== null && endMinute < startMinute;

export const weeklyWindowsSignature = (windows: WeeklyTimeWindow[] = []): string =>
  JSON.stringify(
    windows
      .map((window) => [window.weekday, window.startMinute, window.endMinute])
      .sort((left, right) =>
        left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
      ),
  );

export interface GroupedWindow {
  weekdays: number[];
  startMinute: number;
  endMinute: number;
}

export function groupWeeklyWindows(windows: WeeklyTimeWindow[] = []): GroupedWindow[] {
  if (!windows.length) return [{ weekdays: [], startMinute: 9 * 60, endMinute: 17 * 60 }];
  
  const groups = _.groupBy(windows, (w) => `${w.startMinute}-${w.endMinute}`);
  return _.map(groups, (group) => ({
    weekdays: _.map(group, (w) => Number(w.weekday)),
    startMinute: group[0].startMinute,
    endMinute: group[0].endMinute,
  }));
}

export function repeatWeekdayLabel(windows: WeeklyTimeWindow[] = []): string {
  const selected = [...new Set(windows.map((window) => Number(window.weekday)))]
    .filter((weekday) => weekday >= 1 && weekday <= 7)
    .sort((left, right) => left - right);
  if (!selected.length || selected.length === WEEKDAYS.length) return "";
  return selected.map((weekday) => WEEKDAYS[weekday - 1].slice(0, 3)).join(", ");
}
