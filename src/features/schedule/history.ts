import type { HistoryEntry } from "./types";
export interface HistoryState { undo: HistoryEntry[]; redo: HistoryEntry[] }
export function inverseEntry(entry: HistoryEntry): HistoryEntry {
  return { before: entry.after, after: entry.before, previous: entry.next, next: entry.previous, oldRules: entry.newRules, newRules: entry.oldRules, oldOffset: entry.newOffset, newOffset: entry.oldOffset };
}
/** Called only after a successful canonical server response. */
export function confirmHistory(state: HistoryState, entry: HistoryEntry, mode: "commit" | "undo" | "redo"): HistoryState {
  if(mode==="undo")return {undo:state.undo.slice(0,-1),redo:[...state.redo,inverseEntry(entry)]};
  if(mode==="redo")return {undo:[...state.undo,entry],redo:state.redo.slice(0,-1)};
  return {undo:[...state.undo,entry],redo:[]};
}
export function replaceTemporaryLessons(optimistic: import("./types").ScheduleLesson[], canonical: import("./types").ScheduleLesson[]) {
  const merged=new Map(optimistic.filter(l=>!l.id.startsWith("temp-")).map(l=>[l.id,l]));
  for(const lesson of canonical)merged.set(lesson.id,lesson);
  return [...merged.values()];
}
