// Calendar arithmetic uses UTC methods on a shifted instant, never the host timezone.
export const MINUTE = 60_000;
export const DAY = 1440 * MINUTE;
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value && value >= "0100-01-01" && value <= "9998-12-31";
}
export function localParts(instant: string | number | Date, offset: number) {
  const iso = new Date(new Date(instant).getTime() + (3 + offset) * 60 * MINUTE).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}
export function localToUtc(date: string, time: string, offset: number): string {
  if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !Number.isInteger(offset) || Math.abs(offset) > 12)
    throw new Error("Некорректная дата или время.");
  return new Date(Date.parse(`${date}T${time}:00Z`) - (3 + offset) * 60 * MINUTE).toISOString();
}
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
export function startOfWeek(date: string): string {
  return addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}
export function parseWeek(value: unknown, offset: number, now: Date = new Date()): string {
  return typeof value === "string" && validDate(value)
    ? startOfWeek(value) : startOfWeek(localParts(now, offset).date);
}
export function weeksInMonth(year: number, month: number): string[] {
  const first = `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  const weeks: string[] = [];
  for (let day = startOfWeek(first); day <= last; day = addDays(day, 7)) weeks.push(day);
  return weeks;
}
export function weekBounds(week: string, offset: number) {
  return { start: localToUtc(week, "00:00", offset), end: localToUtc(addDays(week, 7), "00:00", offset) };
}
export function snapMinutes(minutes: number): number { return Math.round(minutes / 5) * 5; }
export function minutesFromMidnight(instant: string | number, offset: number): number {
  const { time } = localParts(instant, offset);
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}
export interface TimedLesson { startsAt: string; endsAt: string }
export function splitLessonByLocalDays(lesson: TimedLesson, offset: number) {
  const segments: { date: string; startMinute: number; endMinute: number; minutes: number; continuation: boolean }[] = [];
  const start = Date.parse(lesson.startsAt), end = Date.parse(lesson.endsAt);
  for (let cursor = start; cursor < end;) {
    const date = localParts(cursor, offset).date;
    const midnight = Date.parse(localToUtc(date, "00:00", offset));
    const next = Math.min(midnight + DAY, end);
    segments.push({ date, startMinute: (cursor - midnight) / MINUTE, endMinute: (next - midnight) / MINUTE, minutes: (next - cursor) / MINUTE, continuation: cursor > start });
    cursor = next;
  }
  return segments;
}
export function clipLessonToWeek(lesson: TimedLesson, week: string, offset: number): number {
  const { start, end } = weekBounds(week, offset);
  return Math.max(0, Math.min(Date.parse(lesson.endsAt), Date.parse(end)) - Math.max(Date.parse(lesson.startsAt), Date.parse(start))) / MINUTE;
}
export function weeklySummary(lessons: TimedLesson[], week: string, offset: number) {
  const end = addDays(week, 7);
  return lessons.reduce((total, lesson) => {
    const date = localParts(lesson.startsAt, offset).date;
    return { count: total.count + Number(date >= week && date < end), minutes: total.minutes + clipLessonToWeek(lesson, week, offset) };
  }, { count: 0, minutes: 0 });
}
export function formatDay(date: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
