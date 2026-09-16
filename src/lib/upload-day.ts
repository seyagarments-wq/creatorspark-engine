/**
 * The one global weekly upload day. Creators batch-upload once a week; the day is
 * a schedule, not a gate: no penalty, no streak, no red state anywhere.
 * Stored in `settings` under key `upload_schedule` as { weekday: Weekday }.
 */
export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const DEFAULT_UPLOAD_WEEKDAY: Weekday = "friday";

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === "string" && (WEEKDAYS as string[]).includes(value);
}

/** "friday" -> "Friday" */
export function weekdayLabel(day: Weekday): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/** JS Date.getDay() index: sunday = 0 ... saturday = 6 */
export function weekdayIndex(day: Weekday): number {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(day);
}

/** Next occurrence of the upload day on or after `from` (local time, midnight). */
export function nextUploadDate(day: Weekday, from: Date = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const diff = (weekdayIndex(day) - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}
