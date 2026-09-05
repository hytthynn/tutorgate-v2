import { addDays, localParts, splitLessonByLocalDays, type TimedLesson } from "../schedule/time";
export type Metric = "earnings" | "hours" | "lessons";
export function aggregateLessons(lessons: (TimedLesson & { completed: boolean })[], from: string, to: string, offset: number, rate: number, metric: Metric) {
  const days = new Map<string, { minutes: number; lessons: number }>();
  for (let day = from; day <= to; day = addDays(day, 1)) days.set(day, { minutes: 0, lessons: 0 });
  for (const lesson of lessons) {
    if (!lesson.completed) continue;
    const start = days.get(localParts(lesson.startsAt, offset).date);
    if (start) start.lessons++;
    for (const part of splitLessonByLocalDays(lesson, offset)) {
      const day = days.get(part.date);
      if (day) day.minutes += part.minutes;
    }
  }
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  let minutes = 0, count = 0;
  const points = [...days].map(([date, value]) => {
    minutes += value.minutes; count += value.lessons;
    return { date: `${date.slice(8)}.${date.slice(5, 7)}`, value: metric === "lessons" ? value.lessons : metric === "hours" ? value.minutes / 60 : round(value.minutes / 60 * rate) };
  });
  return { points, totals: { lessons: count, hours: minutes / 60, earnings: round(minutes / 60 * rate) } };
}
