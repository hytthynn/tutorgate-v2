import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationSchema,
  username,
  telegram,
  registrationSchema,
  hourlyRateSchema,
  assignmentSchema,
} from "../src/lib/validation/schemas";
import { token, hash, updateToken, safeEqual } from "../src/lib/auth/tokens";
test("login is case-insensitive; embedded whitespace and non-Latin names rejected", () => {
  assert.equal(username.parse("  Ivan_2007 "), "ivan_2007");
  for (const value of [
    "иван",
    "ivan petrov",
    "@ivan",
    "iv",
    "ivan!",
    "a".repeat(33),
  ])
    assert.equal(username.safeParse(value).success, false);
});
test("Telegram is normalized and validated", () => {
  assert.equal(telegram.parse(" @IVANOV "), "ivanov");
  assert.equal(telegram.safeParse("https://t.me/ivanov").success, false);
});
test("applications require consent, subjects and role-specific selection", () => {
  const base = {
    role: "student",
    full_name: "Иван Иванов",
    telegram_username: "ivanov",
    subject_ids: ["11111111-1111-4111-8111-111111111111"],
    privacy: true,
    student_goal: "Другое",
  };
  assert.equal(applicationSchema.safeParse(base).success, true);
  for (const change of [
    { privacy: false },
    { subject_ids: [] },
    { role: "admin" },
    { student_goal: "" },
    { role: "tutor" },
  ])
    assert.equal(
      applicationSchema.safeParse({ ...base, ...change }).success,
      false,
    );
});
test("password confirmation, hourly rate, assignment IDs", () => {
  assert.equal(
    registrationSchema.safeParse({
      username: "ivan",
      password: "password1",
      confirm: "password2",
      token: token(),
    }).success,
    false,
  );
  assert.equal(hourlyRateSchema.safeParse({ hourly_rate: -1 }).success, false);
  assert.equal(
    hourlyRateSchema.safeParse({ hourly_rate: 1200.5 }).success,
    true,
  );
  assert.equal(
    assignmentSchema.safeParse({
      student_id: "x",
      subject_id: "x",
      tutor_id: "x",
    }).success,
    false,
  );
});
test("tokens meet Telegram payload limits and retries produce the same link", () => {
  const raw = token();
  assert.match(raw, /^[\w-]{43}$/);
  assert.equal(hash(raw).length, 64);
  assert.notEqual(raw, token());
  assert.equal(updateToken(12, "secret"), updateToken(12, "secret"));
  assert.notEqual(updateToken(12, "secret"), updateToken(13, "secret"));
  assert.equal(safeEqual("secret", "secret"), true);
  assert.equal(safeEqual("secret", "bad"), false);
});
