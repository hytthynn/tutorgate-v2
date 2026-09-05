import { addDays, currentWeek, localToUtc } from "../../src/features/schedule/time";
export const week = currentWeek(0);
export const day = (n: number) => addDays(week, n);
export const at = (n: number, time: string) => localToUtc(day(n), time, 0);
