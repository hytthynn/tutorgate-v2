import { addDays, localParts, splitLessonByLocalDays, type TimedLesson } from "../schedule/time";
export type Metric = "earnings" | "hours" | "lessons";
export function aggregateLessons(lessons: (TimedLesson & { completed: boolean; hourlyRateSnapshot: number })[], from: string, to: string, offset: number, metric: Metric) {
  const days = new Map<string, { minutes: number; lessons: number; earnings: number }>();
  for (let day = from; day <= to; day = addDays(day, 1)) days.set(day, { minutes: 0, lessons: 0, earnings: 0 });
  for (const lesson of lessons) {
    if (!lesson.completed) continue;
    const start = days.get(localParts(lesson.startsAt, offset).date);
    if (start) start.lessons++;
    for (const part of splitLessonByLocalDays(lesson, offset)) {
      const day = days.get(part.date);
      if (day) { day.minutes += part.minutes; day.earnings += part.minutes / 60 * lesson.hourlyRateSnapshot; }
    }
  }
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  let minutes = 0, count = 0, earnings = 0;
  const points = [...days].map(([date, value]) => {
    minutes += value.minutes; count += value.lessons; earnings += value.earnings;
    return { date: `${date.slice(8)}.${date.slice(5, 7)}`, value: metric === "lessons" ? value.lessons : metric === "hours" ? value.minutes / 60 : round(value.earnings) };
  });
  return { points, totals: { lessons: count, hours: minutes / 60, earnings: round(earnings) } };
}
