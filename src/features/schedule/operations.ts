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
/** Delete a transfer pair atomically in the preview; server remains canonical. */
export function removeLessons(lessons: ScheduleLesson[], ids: string[], rules: AvailabilityRule[], offset: number) {
  const removed = new Set(ids);
  const restore = new Set(lessons.filter(l => removed.has(l.id) && l.isTransferTarget && l.transferSourceId).map(l => l.transferSourceId));
  return applyAvailability(lessons.filter(l => !removed.has(l.id)).map(l => {
    if (l.isTransferTarget && l.transferSourceId && removed.has(l.transferSourceId))
      return { ...l, isTransferTarget: false, transferSourceId: null, transferSourceStartsAt: null };
    if (restore.has(l.id) && l.inactiveReason === "transferred")
      return { ...l, inactiveReason: null, inactiveUntil: null, completed: false };
    return l;
  }), rules, offset);
}
/** Only actual conflict edges share defensive lanes. Allowed layers stay full-width.
 * Segment bounds (not UTC day) preserve midnight continuation geometry. */
export function overlapLanes<T extends { lesson: ScheduleLesson; segment: { startMinute: number; endMinute: number } }>(items: T[]) {
  const sorted = [...items].sort((a,b) => a.segment.startMinute - b.segment.startMinute || a.lesson.id.localeCompare(b.lesson.id));
  const conflicts = (a: T, b: T) => a.segment.startMinute < b.segment.endMinute && b.segment.startMinute < a.segment.endMinute && overlaps(a.lesson,b.lesson);
  const seen = new Set<number>();
  const result: (T & { lane: number; lanes: number })[] = [];
  for (let i=0; i<sorted.length; i++) {
    if (seen.has(i)) continue;
    const component = [i]; seen.add(i);
    for (let k=0;k<component.length;k++) for(let j=0;j<sorted.length;j++)
      if(!seen.has(j) && conflicts(sorted[component[k]], sorted[j])) { seen.add(j); component.push(j); }
    component.sort((a,b)=>a-b);
    const lanes: T[][] = [];
    const placed = component.map(index => {
      const item=sorted[index]; let lane=lanes.findIndex(rows => !rows.some(row => conflicts(item,row)));
      if(lane<0) { lane=lanes.length; lanes.push([]); } lanes[lane].push(item);
      return { ...item, lane };
    });
    result.push(...placed.map(item => ({...item, lanes:lanes.length})));
  }
  return result;
}
