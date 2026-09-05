import { validDate } from "../features/schedule/time";

export type DirectoryFilterState = { q: string; filter: string };
export function directoryQuery(state: DirectoryFilterState, key: "subject" | "tutor", base = "") {
  const query = new URLSearchParams(base);
  const q = state.q.trim();
  if (q) query.set("q", q); else query.delete("q");
  if (state.filter) query.set(key, state.filter); else query.delete(key);
  return query.toString();
}
export type StatisticsFilterState = { period: string; tutor: string; metric: string; from: string; to: string };
export function statisticsQuery(state: StatisticsFilterState, base = ""): string | null {
  const query = new URLSearchParams(base);
  query.set("period", state.period); query.set("metric", state.metric);
  if (state.tutor) query.set("tutor", state.tutor); else query.delete("tutor");
  if (state.period === "custom") {
    if (!validDate(state.from) || !validDate(state.to) || state.from > state.to) return null;
    query.set("from", state.from); query.set("to", state.to);
  } else { query.delete("from"); query.delete("to"); }
  return query.toString();
}
