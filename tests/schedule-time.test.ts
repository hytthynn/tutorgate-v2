import test from "node:test";
import assert from "node:assert/strict";
import { addDays, localParts, localToUtc, parseWeek, snapMinutes, splitLessonByLocalDays, startOfWeek, validDate, weeklySummary, weeksInMonth } from "../src/features/schedule/time";
import { aggregateLessons } from "../src/features/statistics/aggregate";
import { lessonSchema } from "../src/features/schedule/validation";
test("Monday weeks, month boundaries and invalid query fallback", () => {
  assert.equal(startOfWeek("2026-09-06"), "2026-08-31");
  assert.equal(startOfWeek("2026-09-07"), "2026-09-07");
  assert.deepEqual(weeksInMonth(2026, 8), ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  assert.equal(startOfWeek("2027-01-01"), "2026-12-28");
  for (const bad of ["2026-02-30", "no", "2026-09-40", ["2026-09-07"], undefined]) {
    assert.equal(parseWeek(bad, 0, new Date("2026-09-06T23:00Z")), "2026-09-07");
  }
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-02-29"), false);
});
test("fixed MSK conversion is independent of browser/host timezone", () => {
  assert.equal(localToUtc("2026-09-05", "00:30", 2), "2026-09-04T19:30:00.000Z");
  for (let offset = -12; offset <= 12; offset++) {
    assert.deepEqual(localParts(localToUtc("2026-09-05", "23:58", offset), offset), { date: "2026-09-05", time: "23:58" });
  }
  assert.deepEqual(localParts("2026-09-06T22:30:00Z", 0), { date: "2026-09-07", time: "01:30" });
  assert.deepEqual(localParts("2026-09-06T22:30:00Z", -3), { date: "2026-09-06", time: "22:30" });
  assert.throws(() => localToUtc("2026-02-30", "12:00", 0));
  assert.throws(() => localToUtc("2026-09-05", "24:00", 0));
});
const crossing = { startsAt: localToUtc("2026-09-06", "23:00", 0), endsAt: localToUtc("2026-09-07", "01:00", 0), completed: true };
test("cross-midnight/week segments, clipped hours and count by start", () => {
  assert.deepEqual(splitLessonByLocalDays(crossing, 0), [
    { date: "2026-09-06", startMinute: 1380, endMinute: 1440, minutes: 60, continuation: false },
    { date: "2026-09-07", startMinute: 0, endMinute: 60, minutes: 60, continuation: true },
  ]);
  assert.deepEqual(weeklySummary([crossing], "2026-08-31", 0), { count: 1, minutes: 60 });
  assert.deepEqual(weeklySummary([crossing], "2026-09-07", 0), { count: 0, minutes: 60 });
  assert.deepEqual(weeklySummary([crossing], "2026-09-14", 0), { count: 0, minutes: 0 });
  const minute = { startsAt: localToUtc("2026-09-06", "23:58", 0), endsAt: localToUtc("2026-09-07", "00:03", 0) };
  assert.deepEqual(splitLessonByLocalDays(minute, 0).map((s) => s.minutes), [2, 3]);
  assert.equal(addDays("2026-09-06", 1), "2026-09-07");
  assert.equal(snapMinutes(1438), 1440);
  assert.equal(snapMinutes(61), 60);
  assert.equal(snapMinutes(62.6), 65);
});
test("actual statistics split days, zero points, current rate and clipped count", () => {
  const lessons = [crossing, { ...crossing, completed: false }];
  const hours = aggregateLessons(lessons, "2026-09-06", "2026-09-12", 0, 1500, "hours");
  assert.equal(hours.points.length, 7);
  assert.deepEqual(hours.points.map((p) => p.value), [1, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual(hours.totals, { lessons: 1, hours: 2, earnings: 3000 });
  assert.deepEqual(aggregateLessons(lessons, "2026-09-07", "2026-09-07", 0, 1800, "lessons").totals, { lessons: 0, hours: 1, earnings: 1800 });
  assert.deepEqual(aggregateLessons(lessons, "2026-09-06", "2026-09-07", -3, 1500, "lessons").points.map((p) => p.value), [1, 0]);
  const tiny = { startsAt: localToUtc("2026-09-06", "10:00", 0), endsAt: localToUtc("2026-09-06", "10:01", 0), completed: true };
  assert.equal(aggregateLessons([tiny, tiny, tiny], "2026-09-06", "2026-09-06", 0, 100, "earnings").totals.earnings, 5);
});
test("lesson form accepts minute precision and validates duration/note/date", () => {
  const value = { studentId: "00000000-0000-4000-8000-000000000004", subjectId: "00000000-0000-4000-8000-000000000010", date: "2026-09-06", time: "23:58", durationMinutes: 600, note: "" };
  assert.equal(lessonSchema.safeParse(value).success, true);
  for (const durationMinutes of [0, 601, 1.5]) assert.equal(lessonSchema.safeParse({ ...value, durationMinutes }).success, false);
  assert.equal(lessonSchema.safeParse({ ...value, note: "x".repeat(4001) }).success, false);
});


test("current local week and future guards cover every MSK offset", async () => {
  const { currentWeek, isFutureWeek } = await import("../src/features/schedule/time");
  const now = new Date("2026-09-06T22:00:00Z");
  assert.equal(currentWeek(0,now),"2026-09-07");
  assert.equal(currentWeek(-3,now),"2026-08-31");
  for (let offset=-12;offset<=12;offset++) {
    const current=currentWeek(offset,now);
    assert.equal(isFutureWeek(current,offset,now),false);
    assert.equal(isFutureWeek(addDays(current,7),offset,now),true);
  }
});
test("day selector always offers seven dates including year boundary", async () => {
  const { dayOptions } = await import("../src/features/schedule/time");
  const days=dayOptions("2027-01-01");
  assert.equal(days.length,7); assert.equal(days[0].value,"2026-12-28");
  assert.equal(days[6].label,"Вс, 03.01"); assert.equal(new Set(days.map(d=>d.value)).size,7);
});
test("magnet checks full duration, chooses later tie, snaps and stays in chosen day", async () => {
  const { nearestFreeStart }=await import("../src/features/schedule/time");
  const at=(time:string)=>localToUtc("2026-09-05",time,0);
  const busy=[{ startsAt:at("10:00"),endsAt:at("11:00") }];
  assert.equal(nearestFreeStart(at("10:30"),60,0,busy),at("11:00"));
  assert.equal(nearestFreeStart(at("10:00"),60,0,busy),at("11:00"));
  assert.equal(nearestFreeStart(at("09:05"),60,0,busy),at("09:00"));
  assert.equal(nearestFreeStart(at("14:03"),60,0,busy),at("14:05"));
  assert.equal(nearestFreeStart(at("23:59"),120,0,[]),at("23:55"));
  assert.equal(nearestFreeStart(at("12:00"),60,0,[{startsAt:at("00:00"),endsAt:localToUtc("2026-09-06","00:00",0)}]),null);
  const previous=[{startsAt:localToUtc("2026-09-04","23:00",0),endsAt:at("01:00")}];
  assert.equal(nearestFreeStart(at("00:00"),60,0,previous),at("01:00"));
});
test("historical subject can only be omitted when unchanged",()=>{
  const input={studentId:"00000000-0000-4000-8000-000000000004",subjectId:null,date:"2026-09-05",time:"10:00",durationMinutes:60,note:""};
  assert.equal(lessonSchema.safeParse(input).success,false);
  assert.equal(lessonSchema.safeParse({...input,subjectChanged:false}).success,true);
});
