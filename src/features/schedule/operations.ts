import type { AvailabilityRule, ScheduleLesson } from "./types";
import { localParts, localToUtc, MINUTE, snapMinutes, startOfWeek } from "./time";
export const isInactive = (l: ScheduleLesson) => l.inactiveReason != null;
export const isMultiSelectable = (l: ScheduleLesson) => !isInactive(l) && l.color !== "coral";
export const isTransferAllowed = (l: ScheduleLesson) => !isInactive(l) && !l.isTransferTarget;
export const conflictClass = (l: ScheduleLesson) => isInactive(l) ? null : l.color === "coral" ? "coral" : "normal";
export const overlaps = (a: ScheduleLesson, b: ScheduleLesson) => conflictClass(a) !== null && conflictClass(a) === conflictClass(b) && (a.tutorId === b.tutorId || a.studentId === b.studentId) && Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(a.endsAt) > Date.parse(b.startsAt);
export function applyAvailability(lessons: ScheduleLesson[], rules: AvailabilityRule[], offset: number) {
  return lessons.map(l => {
    if (l.inactiveReason === "transferred") return l;
    const date = rules.find(r => r.studentId === l.studentId)?.availableFrom;
    const inactive = !!date && localParts(l.startsAt, offset).date < date;
    return { ...l, inactiveReason: inactive ? "available_from" as const : null, inactiveUntil: inactive ? date : null, completed: inactive ? false : l.completed };
  });
}
export function shiftGroup(group: ScheduleLesson[], anchor: string) {
  const delta = Date.parse(anchor) - Math.min(...group.map(l => Date.parse(l.startsAt)));
  return group.map(l => ({ ...l, startsAt: new Date(Date.parse(l.startsAt) + delta).toISOString(), endsAt: new Date(Date.parse(l.endsAt) + delta).toISOString() }));
}
/** Find one common delta. The server repeats this against hidden student conflicts. */
export function placeGroup(group: ScheduleLesson[], desired: string, busy: ScheduleLesson[], offset: number, rules: AvailabilityRule[] = []) {
  if (!group.length) return null;
  const day = localParts(desired, offset).date, midnight = Date.parse(localToUtc(day, "00:00", offset));
  const target = Math.min(1435, Math.max(0, snapMinutes((Date.parse(desired) - midnight) / MINUTE)));
  const minutes = Array.from({ length: 288 }, (_, i) => i * 5).sort((a,b) => Math.abs(a-target)-Math.abs(b-target) || b-a);
  for (const m of minutes) {
    const candidates = applyAvailability(shiftGroup(group, new Date(midnight + m * MINUTE).toISOString()), rules, offset);
    if (candidates.some(l => startOfWeek(localParts(l.startsAt, offset).date) !== startOfWeek(day))) continue;
    if (!candidates.some((l,i) => busy.some(b => overlaps(l,b)) || candidates.slice(i+1).some(b => overlaps(l,b)))) return candidates;
  }
  return null;
}
export function statusLabel(l: ScheduleLesson) {
  if (l.inactiveReason === "transferred") return "Перенесено";
  if (l.inactiveReason === "available_from") return `Сможет заниматься с ${l.inactiveUntil?.slice(8)}.${l.inactiveUntil?.slice(5,7)}`;
  return l.isTransferTarget ? "↪ Перенесённое занятие" : "";
}
/** Connected interval components share a lane count, including midnight segments. */
export function overlapLanes<T extends { segment: { startMinute: number; endMinute: number } }>(items: T[]) {
  const sorted = [...items].sort((a,b) => a.segment.startMinute - b.segment.startMinute);
  const result: (T & { lane: number; lanes: number })[] = [];
  for (let i=0; i<sorted.length;) {
    let end=sorted[i].segment.endMinute, j=i+1;
    while(j<sorted.length && sorted[j].segment.startMinute<end) { end=Math.max(end,sorted[j].segment.endMinute); j++; }
    const laneEnds: number[]=[];
    const component=sorted.slice(i,j).map(item => { let lane=laneEnds.findIndex(e=>e<=item.segment.startMinute); if(lane<0)lane=laneEnds.length; laneEnds[lane]=item.segment.endMinute; return {...item,lane}; });
    result.push(...component.map(item=>({...item,lanes:laneEnds.length}))); i=j;
  }
  return result;
}
