import test from "node:test";
import assert from "node:assert/strict";
import { directoryQuery, statisticsQuery } from "../src/lib/filters";
test("directory URL always contains the complete latest search + selection", () => {
  const current = { q: "Мария", filter: "math" };
  const query = new URLSearchParams(directoryQuery(current, "subject", "view=list&q=old"));
  assert.equal(query.get("q"), "Мария"); assert.equal(query.get("subject"), "math"); assert.equal(query.get("view"), "list");
  assert.equal(directoryQuery({ q: "  ", filter: "" }, "subject", "q=old&subject=math"), "");
  assert.equal(new URLSearchParams(directoryQuery({ q: "Анна", filter: "t1" }, "tutor")).get("tutor"), "t1");
});
const state = { period: "custom", metric: "hours", tutor: "t1", from: "2026-09-01", to: "2026-09-05" };
test("custom statistics commits only valid complete date pairs", () => {
  assert.ok(statisticsQuery(state));
  for (const patch of [{from:""}, {to:""}, {from:"2026-09-06"}, {from:"2026-02-30"}, {to:"invalid"}]) assert.equal(statisticsQuery({...state,...patch}), null);
  assert.ok(statisticsQuery({...state,to:state.from}));
});
test("preset periods remove dates and empty tutor without losing metric", () => {
  const query = new URLSearchParams(statisticsQuery({...state,period:"14",tutor:""}, "from=old&to=old&tutor=t1")!);
  assert.equal(query.get("period"), "14"); assert.equal(query.get("metric"), "hours");
  for (const key of ["from", "to", "tutor"]) assert.equal(query.has(key), false);
});
