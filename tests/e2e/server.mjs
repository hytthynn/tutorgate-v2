// Isolated UI fixtures. This process is never imported by application code.
// PostgreSQL/RLS behaviour is separately tested with real migrations in PGlite.
import http from "node:http";
import { spawn } from "node:child_process";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const profiles = [
  {
    id: id(1),
    role: "admin",
    full_name: "Александр Волков",
    telegram_username: "alex_volkov",
  },
  {
    id: id(2),
    role: "tutor",
    full_name: "Мария Соколова",
    telegram_username: "maria_sokolova",
  },
  {
    id: id(3),
    role: "tutor",
    full_name: "Дмитрий Лебедев",
    telegram_username: "dmitry_lebedev",
  },
  {
    id: id(4),
    role: "student",
    full_name: "Анна Смирнова",
    telegram_username: "anna_smirnova",
  },
  {
    id: id(5),
    role: "student",
    full_name: "Михаил Кузнецов",
    telegram_username: "mikhail_kuznetsov",
  },
];
const subjects = [
  "Математика",
  "Физика",
  "Английский язык",
  "Русский язык",
  "Информатика",
  "Химия",
].map((name, i) => ({ id: id(10 + i), name, is_active: true }));
const tutorSubjects = [
  { tutor_id: id(1), subject_id: id(10) },
  { tutor_id: id(2), subject_id: id(10) },
  { tutor_id: id(2), subject_id: id(11) },
  { tutor_id: id(3), subject_id: id(12) },
];
const assignments = [
  { id: id(20), student_id: id(4), tutor_id: id(2), subject_id: id(10) },
  { id: id(21), student_id: id(5), tutor_id: id(2), subject_id: id(11) },
];
const sessions = new Map();
const lessons = [];
const notes = new Map();
const preferences = new Map();
let nextLesson = 100;
function resetSchedule() {
  lessons.length = 0; notes.clear(); preferences.clear(); nextLesson = 100;
  for (const [student, starts, duration] of [[4, "2026-08-31T07:00:00Z", 60], [5, "2026-08-31T09:00:00Z", 60], [4, "2026-09-06T20:00:00Z", 120]]) {
    const lesson = { id: id(nextLesson++), tutor_id: id(2), student_id: id(student), subject_id: id(10), starts_at: starts, ends_at: new Date(Date.parse(starts) + duration * 60000).toISOString(), duration_minutes: duration, color: "default", completed_at: null };
    lessons.push(lesson); notes.set(lesson.id, "PRIVATE_TUTOR_NOTE_секрет");
  }
}
resetSchedule();
function matches(row, params) {
  return [...params].every(([key, filter]) => {
    if (["select", "order", "offset", "limit", "subjects.is_active"].includes(key)) return true;
    if (filter === "not.is.null") return row[key] != null;
    const value = filter.slice(filter.indexOf(".") + 1);
    if (filter.startsWith("eq.")) return String(row[key]) === value;
    if (filter.startsWith("lt.")) return Date.parse(row[key]) < Date.parse(value);
    if (filter.startsWith("gt.")) return Date.parse(row[key]) > Date.parse(value);
    if (filter.startsWith("in.")) return value.slice(1, -1).split(",").includes(row[key]);
    return true;
  });
}
function overlaps(candidate) {
  return lessons.some((l) => l.id !== candidate.id && (l.tutor_id === candidate.tutor_id || l.student_id === candidate.student_id) && Date.parse(l.starts_at) < Date.parse(candidate.ends_at) && Date.parse(l.ends_at) > Date.parse(candidate.starts_at));
}
const jwt = (uid) =>
  `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: uid, email: "hidden_alias@internal.test", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture-signature`;
function user(uid) {
  return {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "hidden_alias@internal.test",
    created_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
  };
}
const server = http.createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  const args = text ? JSON.parse(text) : {};
  const url = new URL(req.url, "http://localhost");
  let uid;
  try {
    uid = JSON.parse(
      Buffer.from(
        (req.headers.authorization ?? "").split(".")[1],
        "base64url",
      ).toString(),
    ).sub;
  } catch {}
  const profile = profiles.find((p) => p.id === uid);
  let value = [];
  let status = 200;
  const op = url.pathname.split("/").at(-1);
  if (url.pathname === "/fixtures/reset-schedule") { resetSchedule(); value = true; }
  else if (op === "save_schedule_lesson") {
    const old = args.p_id ? lessons.find((l) => l.id === args.p_id && l.tutor_id === uid) : null;
    const candidate = { ...(old ?? { id: id(nextLesson++), tutor_id: uid, color: "default", completed_at: null }), student_id: args.p_student, subject_id: args.p_subject, starts_at: args.p_start, duration_minutes: args.p_duration, ends_at: new Date(Date.parse(args.p_start) + args.p_duration * 60000).toISOString() };
    if (profile?.role === "student" || (args.p_id && !old)) { status = 403; value = { code: "42501" }; }
    else if (overlaps(candidate)) { status = 409; value = { code: "23P01" }; }
    else { if (old) Object.assign(old, candidate); else lessons.push(candidate); notes.set(candidate.id, args.p_note); value = candidate.id; }
  } else if (op === "delete_schedule_lessons") {
    if (profile?.role === "student") { status = 403; value = { code: "42501" }; }
    else {
      const owned = lessons.filter((l) => l.tutor_id === uid && args.p_ids.includes(l.id));
      for (const row of owned) { lessons.splice(lessons.indexOf(row), 1); notes.delete(row.id); }
      value = owned.length;
    }
  } else if (op === "lessons") {
    const readable = lessons.filter((l) => profile?.role === "admin" || l.tutor_id === uid || l.student_id === uid);
    const filtered = readable.filter((l) => matches(l, url.searchParams));
    if (req.method === "PATCH") {
      value = [];
      for (const old of filtered.filter((l) => l.tutor_id === uid && profile?.role !== "student")) {
        const candidate = { ...old, ...args };
        candidate.ends_at = new Date(Date.parse(candidate.starts_at) + candidate.duration_minutes * 60000).toISOString();
        if (overlaps(candidate)) { status = 409; value = { code: "23P01" }; break; }
        Object.assign(old, candidate); value.push(candidate);
      }
    } else if (req.method === "DELETE") {
      for (const row of filtered.filter((l) => l.tutor_id === uid && profile?.role !== "student")) { lessons.splice(lessons.indexOf(row), 1); notes.delete(row.id); }
      value = [];
    } else value = filtered.slice(Number(url.searchParams.get("offset") ?? 0), Number(url.searchParams.get("offset") ?? 0) + Number(url.searchParams.get("limit") ?? 500));
  } else if (op === "schedule_lesson_names") {
    value = lessons.filter((l) => args.p_ids.includes(l.id) && (profile?.role === "admin" || l.tutor_id === uid || l.student_id === uid)).map((l) => ({ id: l.id, student_name: profiles.find((p) => p.id === l.student_id)?.full_name, tutor_name: profiles.find((p) => p.id === l.tutor_id)?.full_name, subject_name: subjects.find((s) => s.id === l.subject_id)?.name }));
  } else if (op === "lesson_private_notes") {
    value = profile?.role === "student" ? [] : lessons.filter((l) => l.tutor_id === uid || profile?.role === "admin").map((l) => ({ lesson_id: l.id, note: notes.get(l.id) ?? "" })).filter((l) => matches(l, url.searchParams));
  } else if (op === "user_schedule_preferences") {
    if (req.method === "POST" && args.user_id === uid) preferences.set(uid, { user_id: uid, msk_offset_hours: args.msk_offset_hours });
    value = preferences.has(uid) ? [preferences.get(uid)] : [];
  } else if (url.pathname === "/auth/v1/token") {
    const name = args.email?.split("@")[0];
    const p = profiles.find((p) => p.role === name) ?? profiles[0];
    value = {
      access_token: jwt(p.id),
      refresh_token: "fixture-refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: user(p.id),
    };
  } else if (url.pathname === "/auth/v1/user") value = user(uid);
  else if (op === "session_read") value = sessions.get(args.p_hash) ?? null;
  else if (op === "session_write") {
    sessions.set(args.p_hash, args.p_cookies);
    value = null;
  } else if (op === "lookup_alias") value = `${args.p_username}@internal.test`;
  else if (op === "rate_limit") value = true;
  else if (op === "bind_session") value = null;
  else if (op === "profiles")
    value = profiles.filter(
      (p) =>
        !url.searchParams.get("id") ||
        `eq.${p.id}` === url.searchParams.get("id"),
    );
  else if (op === "visible_profiles") {
    value =
      profile?.role === "admin"
        ? profiles
        : profiles.filter(
            (p) =>
              p.id === uid ||
              assignments.some(
                (a) =>
                  (a.student_id === uid && a.tutor_id === p.id) ||
                  (a.tutor_id === uid && a.student_id === p.id),
              ),
          );
    if (url.searchParams.has("id"))
      value = value.filter((p) => `eq.${p.id}` === url.searchParams.get("id"));
  } else if (op === "subjects") value = subjects;
  else if (op === "tutor_subjects") value = tutorSubjects.filter((s) => matches(s, url.searchParams)).map((s) => url.searchParams.get("select")?.includes("subjects!") ? { ...s, subjects: subjects.find((sub) => sub.id === s.subject_id) } : s);
  else if (op === "student_tutor_assignments")
    value =
      profile?.role === "admin"
        ? assignments
        : assignments.filter((a) => a.student_id === uid || a.tutor_id === uid);
  else if (op === "app_settings") value = [{ hourly_rate: 1500 }];
  else if (op === "token_status") value = args.p_hash ? "valid" : null;
  if (req.headers.accept?.includes("vnd.pgrst.object") && Array.isArray(value))
    value = value[0] ?? null;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
});
server.listen(54329, "127.0.0.1");
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-p", "3100"],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
      SUPABASE_SECRET_KEY: "fixture-secret",
      TELEGRAM_BOT_USERNAME: "tutorgate_fixture_bot",
      TELEGRAM_WEBHOOK_SECRET: "fixture-webhook",
      AUTH_ALIAS_DOMAIN: "internal.test",
      APP_URL: "http://localhost:3100",
    },
  },
);
function close() {
  child.kill();
  server.close();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
child.on("exit", () => {
  server.close();
  process.exit();
});
